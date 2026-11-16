-- Shared successful-read admission. Source preparation only; deploy with the matching Edge adapter.
create table private.read_budgets (
 scope text primary key check(scope in ('global','anon','member','owner')),
 max_per_second integer not null check(max_per_second between 1 and 10000)
);
insert into private.read_budgets values ('global',300),('anon',200),('member',240),('owner',120);
create table private.read_windows (
 scope text primary key references private.read_budgets(scope),
 window_start timestamptz not null,
 count integer not null check(count between 1 and 10000)
);
alter table private.read_budgets enable row level security;
alter table private.read_windows enable row level security;
revoke all on private.read_budgets,private.read_windows from public,anon,authenticated;

create function private.admit_read() returns void language plpgsql volatile security definer set search_path='' as $$
declare bucket text; cap integer; used integer; tick timestamptz:=date_trunc('second',clock_timestamp());
 caller_class text:=case when auth.uid() is null then 'anon' when private.is_owner() then 'owner' else 'member' end;
begin
 if current_setting('request.method',true) in ('GET','HEAD') then
  raise sqlstate 'PT405' using message='Use POST for read RPC';
 end if;
 -- Do not return data under a client-requested rollback that would erase admission.
 if coalesce((nullif(current_setting('request.headers',true),'')::jsonb)->>'prefer','') ~* '(^|,)[[:space:]]*tx[[:space:]]*=' then
  raise sqlstate 'PT422' using message='Transaction preference is not supported';
 end if;
 if current_setting('pgrst.db_tx_end',true) in ('rollback','rollback-allow-override') then
  raise sqlstate 'PT503' using message='Read admission unavailable';
 end if;
 -- Fixed lock order across every worker and caller; no per-user/IP counter retention.
 foreach bucket in array array['global',caller_class] loop
  select max_per_second into cap from private.read_budgets where scope=bucket;
  if cap is null then raise sqlstate 'PT503' using message='Read admission unavailable';end if;
  insert into private.read_windows as w values(bucket,tick,1)
  on conflict(scope) do update set window_start=greatest(w.window_start,excluded.window_start),
   count=case when w.window_start<excluded.window_start then 1 else w.count+1 end
  where w.window_start<excluded.window_start or w.count<cap
  returning count into used;
  if used is null then raise sqlstate 'PT429' using message='Read budget exceeded';end if;
 end loop;
end $$;
revoke all on function private.admit_read() from public;
grant execute on function private.admit_read() to anon,authenticated;

-- Direct Data API table/embedding/GraphQL reads must not bypass RPC admission.
-- Existing RLS remains enabled; private functions preserve visibility explicitly.
revoke select on public.content_entities,public.comments,public.profiles,public.role_assignments,
 public.comment_revisions,public.audit_events from public,anon,authenticated;

create function private.resolve_entity(p_path text default null,p_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare answer jsonb;
begin
 perform private.admit_read();
 if (p_path is null)=(p_id is null) or length(p_path)>2048 then raise sqlstate 'PT422' using message='One entity key required';end if;
 select jsonb_build_object('id',id,'canonical_path',canonical_path) into answer from public.content_entities
 where (canonical_path=p_path or id=p_id) and private.entity_visible(id);
 return answer;
end $$;
create function private.comment_projection(p_entity_id uuid default null,p_after_time timestamptz default null,p_after_id uuid default null,
 p_limit integer default 20,p_parent_id uuid default null,p_mine boolean default false,p_feed boolean default false,p_shadow boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare answer jsonb; actor uuid:=auth.uid(); owner boolean:=private.is_owner();
begin
 if p_limit is null or p_limit not between 1 and 51 or p_mine is null or p_feed is null or p_shadow is null or
 (p_after_time is null)<>(p_after_id is null) or (p_mine and p_parent_id is not null) then raise sqlstate 'PT422' using message='Invalid comment query';end if;
 if p_mine and actor is null then raise sqlstate 'PT401' using message='Sign in required';end if;
 if not p_feed and not p_shadow and p_entity_id is null and not owner then raise sqlstate 'PT403' using message='Owner required';end if;
 select coalesce(jsonb_agg(row.data order by row.created_at desc,row.id desc),'[]') into answer from (
  select to_jsonb(c)||jsonb_build_object('context_path',e.canonical_path) as data,c.created_at,c.id
  from public.comments c join public.content_entities e on e.id=c.entity_id
  where c.deleted_at is null and private.entity_visible(c.entity_id)
  and (c.author_id=actor or owner or (c.status='approved' and (c.parent_id is null or private.root_public(c.parent_id))))
  and (p_entity_id is null or c.entity_id=p_entity_id)
  and (p_after_time is null or (c.created_at,c.id)<(p_after_time,p_after_id))
  and case when p_shadow then c.status='approved' and (c.parent_id is null or private.root_public(c.parent_id))
   when p_mine then c.author_id=actor
   when p_entity_id is not null then c.parent_id is not distinct from p_parent_id
   when p_feed then c.parent_id is null else c.status='pending' end
  order by c.created_at desc,c.id desc limit p_limit
 ) row;
 return answer;
end $$;
revoke all on function private.comment_projection(uuid,timestamptz,uuid,integer,uuid,boolean,boolean,boolean) from public,anon,authenticated;
create function private.read_comments(p_entity_id uuid default null,p_after_time timestamptz default null,p_after_id uuid default null,
 p_limit integer default 20,p_parent_id uuid default null,p_mine boolean default false,p_feed boolean default false,p_shadow boolean default false) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
 perform private.admit_read();
 return private.comment_projection(p_entity_id,p_after_time,p_after_id,p_limit,p_parent_id,p_mine,p_feed,p_shadow);
end $$;
create function public.resolve_entity(p_path text default null,p_id uuid default null) returns jsonb
language sql volatile security invoker set search_path='' as $$select private.resolve_entity(p_path,p_id)$$;
create function public.read_comments(p_entity_id uuid default null,p_after_time timestamptz default null,p_after_id uuid default null,
 p_limit integer default 20,p_parent_id uuid default null,p_mine boolean default false,p_feed boolean default false,p_shadow boolean default false) returns jsonb
language sql volatile security invoker set search_path='' as $$select private.read_comments(p_entity_id,p_after_time,p_after_id,p_limit,p_parent_id,p_mine,p_feed,p_shadow)$$;
create function public.caller_is_owner() returns boolean language plpgsql volatile security invoker set search_path='' as $$
begin perform private.admit_read();return private.is_owner();end $$;
revoke all on function private.resolve_entity(text,uuid),private.read_comments(uuid,timestamptz,uuid,integer,uuid,boolean,boolean,boolean),
 public.resolve_entity(text,uuid),public.read_comments(uuid,timestamptz,uuid,integer,uuid,boolean,boolean,boolean),public.caller_is_owner() from public,anon,authenticated;
grant execute on function private.resolve_entity(text,uuid),private.read_comments(uuid,timestamptz,uuid,integer,uuid,boolean,boolean,boolean),
 public.resolve_entity(text,uuid),public.read_comments(uuid,timestamptz,uuid,integer,uuid,boolean,boolean,boolean),public.caller_is_owner() to anon,authenticated;

-- Keep all existing read signatures/DTOs, but charge before executing them.
create or replace function public.comment_state() returns table(source text, epoch integer, writes_enabled boolean)
language plpgsql volatile security invoker set search_path='' as $$
begin
 perform private.admit_read();
 return query select * from private.comment_state();
end $$;
create or replace function public.feature_state(p_feature text) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
begin
 perform private.admit_read();
 return (select private.feature_state(p_feature));
end $$;
create or replace function public.publication_read(p_feature text,p_view text default 'public',p_id uuid default null,p_limit integer default 20,p_after_time timestamptz default null,p_after_id uuid default null) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
begin
 perform private.admit_read();
 return (select private.publication_read(p_feature,p_view,p_id,p_limit,p_after_time,p_after_id));
end $$;
create or replace function public.publication_history(p_id uuid,p_before integer default null,p_limit integer default 20) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
begin
 perform private.admit_read();
 return (select private.publication_history(p_id,p_before,p_limit));
end $$;
create or replace function public.request_read(p_view text default 'public',p_id uuid default null,p_limit integer default 20,p_after_time timestamptz default null,p_after_id uuid default null,p_status text default null) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
begin
 perform private.admit_read();
 return (select private.request_read(p_view,p_id,p_limit,p_after_time,p_after_id,p_status));
end $$;
create or replace function public.request_history(p_id uuid,p_before integer default null,p_limit integer default 20) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
begin
 perform private.admit_read();
 return (select private.request_history(p_id,p_before,p_limit));
end $$;
create or replace function public.request_legacy(p_number integer) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
begin
 perform private.admit_read();
 return (select private.request_legacy(p_number));
end $$;

-- Mutating RPC replay can also return data: charge the same admission budget.
create or replace function public.create_comment(p_entity_id uuid, p_body text, p_key uuid, p_parent_id uuid default null) returns public.comments
language plpgsql volatile security invoker set search_path='' as $$
begin perform private.admit_read();return (select private.write_comment('create', p_entity_id => p_entity_id, p_parent_id => p_parent_id, p_body => p_body, p_key => p_key));end $$;
create or replace function public.edit_comment(p_id uuid, p_body text, p_expected_version integer) returns public.comments
language plpgsql volatile security invoker set search_path='' as $$
begin perform private.admit_read();return (select private.write_comment('edit', p_id => p_id, p_body => p_body, p_expected_version => p_expected_version));end $$;
create or replace function public.delete_comment(p_id uuid, p_expected_version integer) returns public.comments
language plpgsql volatile security invoker set search_path='' as $$
begin perform private.admit_read();return (select private.write_comment('delete', p_id => p_id, p_expected_version => p_expected_version));end $$;
create or replace function public.moderate_comment(p_id uuid, p_status text, p_expected_version integer, p_reason text) returns public.comments
language plpgsql volatile security invoker set search_path='' as $$
begin perform private.admit_read();return (select private.write_comment('moderate', p_id => p_id, p_status => p_status, p_expected_version => p_expected_version, p_reason => p_reason));end $$;
create or replace function public.publication_write(p_feature text,p_action text,p_id uuid default null,p_payload jsonb default null,p_expected_version integer default null,p_key uuid default null,p_revision integer default null,p_reason text default null) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
begin perform private.admit_read();return (select private.publication_write(p_feature,p_action,p_id,p_payload,p_expected_version,p_key,p_revision,p_reason));end $$;
create or replace function public.request_write(p_action text,p_id uuid default null,p_payload jsonb default null,p_expected_version integer default null,p_key uuid default null,p_scope_revision integer default null,p_status text default null,p_message text default null,p_result text default null,p_target uuid default null) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
begin perform private.admit_read();return (select private.request_write(p_action,p_id,p_payload,p_expected_version,p_key,p_scope_revision,p_status,p_message,p_result,p_target));end $$;
