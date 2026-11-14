create table private.help_requests(
 id uuid primary key default gen_random_uuid(),entity_id uuid not null unique references public.content_entities(id),author_id uuid references public.profiles(id),
 version integer not null default 1 check(version>0),scope_revision integer not null default 1,accepted_scope_revision integer,
 moderation text not null default 'pending' check(moderation in ('pending','approved','rejected','hidden')),
 status text not null default 'new' check(status in ('new','accepted','in-progress','waiting','completed','declined','cancelled')),result text not null default '',
 legacy_number integer unique,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz,
 check(status<>'completed' or (accepted_scope_revision is not null and accepted_scope_revision=scope_revision and length(btrim(result))>0)),
 check(status not in ('accepted','in-progress','waiting','completed') or (accepted_scope_revision is not null and accepted_scope_revision=scope_revision))
);
create table private.request_scope_revisions(
 request_id uuid not null references private.help_requests(id),revision integer not null,title text not null,description text not null,expected_result text not null,
 category text not null check(category in ('technology','creative','information','other')),priority text not null check(priority in ('low','normal','high')),tags text[] not null,
 actor_id uuid references public.profiles(id),created_at timestamptz not null default now(),primary key(request_id,revision)
);
alter table private.help_requests add foreign key(id,scope_revision) references private.request_scope_revisions(request_id,revision) deferrable initially deferred;
alter table private.help_requests add foreign key(id,accepted_scope_revision) references private.request_scope_revisions(request_id,revision) deferrable initially deferred;
create table private.request_events(
 id uuid primary key default gen_random_uuid(),request_id uuid not null references private.help_requests(id),version integer not null,scope_revision integer not null,
 actor_id uuid references public.profiles(id),action text not null,status_after text not null,message text not null,result text,corrects uuid references private.request_events(id),created_at timestamptz not null default now(),
 unique(request_id,version),foreign key(request_id,scope_revision) references private.request_scope_revisions(request_id,revision)
);
create index request_cursor on private.help_requests(created_at desc,id desc);
create index request_author on private.help_requests(author_id,created_at desc,id desc);
create function private.request_payload(p_id uuid,p_revision integer) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('title',title,'description',description,'expectedResult',expected_result,'category',category,'priority',priority,'tags',tags) from private.request_scope_revisions where request_id=p_id and revision=p_revision;
$$;
create function private.request_json(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r private.help_requests;
begin
 select * into r from private.help_requests where id=p_id and deleted_at is null;
 if not found or not (r.moderation='approved' or coalesce(r.author_id=auth.uid(),false) or private.is_owner()) then raise sqlstate 'PT404' using message='Request not found';end if;
 return jsonb_build_object('id',r.id,'entity_id',r.entity_id,'author_id',r.author_id,'version',r.version,'scope_revision',r.scope_revision,'accepted_scope_revision',r.accepted_scope_revision,'moderation',r.moderation,'status',r.status,'result',r.result,'legacy_number',r.legacy_number,'created_at',r.created_at,'updated_at',r.updated_at,'payload',private.request_payload(r.id,r.scope_revision));
end $$;
create function private.request_read(p_view text default 'public',p_id uuid default null,p_limit integer default 20,p_after_time timestamptz default null,p_after_id uuid default null,p_status text default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare row private.help_requests;output jsonb:='[]';
begin
 if p_view not in ('public','mine','all') or p_limit not between 1 and 51 or (p_status is not null and p_status not in ('new','accepted','in-progress','waiting','completed','declined','cancelled')) then raise sqlstate 'PT422' using message='Invalid request query';end if;
 if p_view='mine' and auth.uid() is null then raise sqlstate 'PT401' using message='Authentication required';end if;
 if p_view='all' and not private.is_owner() then raise sqlstate 'PT403' using message='Owner required';end if;
 if p_id is not null then return private.request_json(p_id);end if;
 for row in select * from private.help_requests where deleted_at is null and (p_status is null or status=p_status) and (p_after_time is null or (created_at,id)<(p_after_time,p_after_id)) and
 ((p_view='public' and moderation='approved') or (p_view='mine' and author_id=auth.uid()) or p_view='all') order by created_at desc,id desc limit p_limit loop
 output:=output||jsonb_build_array(private.request_json(row.id));end loop;return output;
end $$;
create function private.request_history(p_id uuid,p_before integer default null,p_limit integer default 20) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare output jsonb;
begin
 perform private.request_json(p_id);
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version,'scope_revision',scope_revision,'actor_id',actor_id,'action',action,'status',status_after,'message',message,'result',result,'corrects',corrects,'created_at',created_at) order by version desc),'[]') into output from (select * from private.request_events where request_id=p_id and (p_before is null or version<p_before) order by version desc limit least(greatest(p_limit,1),51)) limited;
 return output;
end $$;
create function private.request_write(p_action text,p_id uuid default null,p_payload jsonb default null,p_expected_version integer default null,p_key uuid default null,p_scope_revision integer default null,p_status text default null,p_message text default null,p_result text default null,p_target uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();r private.help_requests;saved private.feature_receipts;fingerprint jsonb;title text;description text;expected text;category text;priority text;tags text[];normalized jsonb;changed boolean;next_scope integer;allowed text[];
begin
 if actor is null then raise sqlstate 'PT401' using message='Authentication required';end if;
 if p_action not in ('create','scope','moderate','transition','correction') or p_key is null then raise sqlstate 'PT422' using message='Invalid mutation';end if;
 if not exists(select 1 from private.feature_controls where feature='requests' and source='api' and epoch>0 and writes_enabled) then raise sqlstate 'PT503' using message='Feature writes disabled';end if;
 fingerprint:=jsonb_build_object('action',p_action,'id',p_id,'payload',p_payload,'version',p_expected_version,'scope',p_scope_revision,'status',p_status,'message',p_message,'result',p_result,'target',p_target);
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_key::text,0));
 select * into saved from private.feature_receipts where actor_id=actor and key=p_key;
 if found then if saved.fingerprint<>fingerprint then raise sqlstate 'PT409' using message='Idempotency key reused';end if;return private.request_json(saved.object_id);end if;
 if p_action<>'create' then
  select * into r from private.help_requests where id=p_id and deleted_at is null for update;
  if not found then raise sqlstate 'PT404' using message='Request not found';end if;
  if p_action in ('moderate','transition','correction') then
   if not private.is_owner() then raise sqlstate 'PT403' using message='Owner required';end if;
  elsif r.author_id is distinct from actor then raise sqlstate 'PT403' using message='Author required';end if;
  if p_expected_version is null or p_expected_version<>r.version then raise sqlstate 'PT409' using message='Version conflict';end if;
  if p_scope_revision is null or p_scope_revision<>r.scope_revision then raise sqlstate 'PT409' using message='Scope conflict';end if;
 end if;
 if p_action in ('create','scope') then
  if jsonb_typeof(p_payload) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_payload) k where k<>all(array['title','description','expectedResult','category','priority','tags'])) then raise sqlstate 'PT422' using message='Invalid request payload';end if;
  title:=private.text_field(p_payload,'title',3,120);description:=private.text_field(p_payload,'description',10,4000);expected:=private.text_field(p_payload,'expectedResult',3,1000);
  category:=private.text_field(p_payload,'category',1,30);priority:=private.text_field(p_payload,'priority',1,20);tags:=private.tag_list(coalesce(p_payload->'tags','[]'));
  if category not in ('technology','creative','information','other') or priority not in ('low','normal','high') then raise sqlstate 'PT422' using message='Invalid category/priority';end if;
  normalized:=jsonb_build_object('title',title,'description',description,'expectedResult',expected,'category',category,'priority',priority,'tags',tags);
 else
  if p_message is null or length(btrim(p_message))<1 or private.text_units(p_message)>2000 or (p_result is not null and private.text_units(p_result)>4000) then raise sqlstate 'PT422' using message='Message/result invalid';end if;
  if p_action='moderate' and p_status not in ('approved','rejected','hidden') then raise sqlstate 'PT422' using message='Invalid moderation';end if;
  if p_action='correction' and (p_target is null or not exists(select 1 from private.request_events where id=p_target and request_id=p_id)) then raise sqlstate 'PT422' using message='Correction target required';end if;
  if p_action='transition' then
   allowed:=case r.status when 'new' then array['accepted','declined','cancelled'] when 'accepted' then array['in-progress','waiting','completed','cancelled'] when 'in-progress' then array['waiting','completed','cancelled'] when 'waiting' then array['in-progress','completed','cancelled'] when 'completed' then array['in-progress'] when 'declined' then array['accepted'] when 'cancelled' then array['accepted'] end;
   if p_status is null or (p_status<>r.status and not(p_status=any(allowed))) then raise sqlstate 'PT422' using message='Invalid transition';end if;
   if p_status='completed' and (r.accepted_scope_revision is distinct from r.scope_revision or length(btrim(coalesce(p_result,'')))=0) then raise sqlstate 'PT422' using message='Accepted scope and completion result required';end if;
  end if;
 end if;
 perform private.feature_guard('requests');
 if p_action='create' then
  r.id:=gen_random_uuid();
  insert into public.content_entities(id,collection,legacy_key,canonical_path) values(r.id,'page','requests:'||r.id::text,'/hiens-nha/requests/detail/?id='||r.id::text);
  insert into private.help_requests(id,entity_id,author_id) values(r.id,r.id,actor) returning * into r;
  insert into private.request_scope_revisions values(r.id,1,title,description,expected,category,priority,tags,actor,now());
 elsif p_action='scope' then
  changed:=normalized<>private.request_payload(r.id,r.scope_revision);next_scope:=r.scope_revision+case when changed then 1 else 0 end;
  if changed then insert into private.request_scope_revisions values(r.id,next_scope,title,description,expected,category,priority,tags,actor,now());end if;
  update private.help_requests set version=version+1,scope_revision=next_scope,status=case when changed then 'new' else status end,
   accepted_scope_revision=case when changed then null else accepted_scope_revision end,result=case when changed then '' else result end,updated_at=now() where id=r.id returning * into r;
 elsif p_action='moderate' then
  if p_status is null then raise sqlstate 'PT422' using message='Moderation required';end if;
  update private.help_requests set moderation=p_status,version=version+1,updated_at=now() where id=r.id returning * into r;
 elsif p_action='transition' then
  update private.help_requests set status=p_status,version=version+1,updated_at=now(),
    accepted_scope_revision=case when p_status='accepted' then scope_revision when p_status in ('new','declined','cancelled') then null else accepted_scope_revision end,
    result=case when p_status='completed' then btrim(p_result) else '' end where id=r.id returning * into r;
 else
  update private.help_requests set version=version+1,updated_at=now() where id=r.id returning * into r;
 end if;
 insert into private.request_events(request_id,version,scope_revision,actor_id,action,status_after,message,result,corrects)
 values(r.id,r.version,r.scope_revision,actor,p_action,r.status,case when p_action='create' then 'Request submitted' when p_action='scope' then case when changed then 'Scope changed; acceptance reset' else 'Scope saved without changes' end else btrim(p_message) end,r.result,p_target);
 insert into private.feature_receipts values(actor,p_key,'requests',fingerprint,r.id);
 return private.request_json(r.id);
end $$;

-- Visibility of discussions follows their linked dynamic object, not a query-string shell.
create function private.entity_visible(p_entity uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare p private.publications;r private.help_requests;
begin
 select * into p from private.publications where entity_id=p_entity;
 if found then return p.deleted_at is null and (p.published_revision is not null or coalesce(p.author_id=auth.uid(),false) or private.is_owner());end if;
 select * into r from private.help_requests where entity_id=p_entity;
 if found then return r.deleted_at is null and (r.moderation='approved' or coalesce(r.author_id=auth.uid(),false) or private.is_owner());end if;
 return true;
end $$;
drop policy entity_read on public.content_entities;
create policy entity_read on public.content_entities for select to anon,authenticated using(private.entity_visible(id));
drop policy comment_read on public.comments;
create policy comment_read on public.comments for select to anon,authenticated using(private.entity_visible(entity_id) and (author_id=(select auth.uid()) or (select private.is_owner()) or (deleted_at is null and status='approved' and (parent_id is null or private.root_public(parent_id)))));
-- Application/RPC helpers in phase 2 execute as definer; validate entity visibility there too.
create or replace function private.write_comment(
  p_action text, p_id uuid default null, p_entity_id uuid default null, p_parent_id uuid default null,
  p_body text default null, p_status text default null, p_expected_version integer default null,
  p_key uuid default null, p_reason text default null
) returns public.comments language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  owner_actor boolean := private.is_owner();
  item public.comments;
  parent public.comments;
  saved private.mutation_keys;
  payload jsonb;
  window_count integer;
begin
  if actor is null then raise sqlstate 'PT401' using message = 'Authentication required'; end if;
  if not exists(select 1 from private.backend_settings where comments_writes_enabled and comments_source = 'api' and comments_epoch > 0) then
    raise sqlstate 'PT503' using message = 'Comment writes disabled';
  end if;
  if p_action not in ('create', 'edit', 'delete', 'moderate') or p_action is null then
    raise sqlstate 'PT422' using message = 'Invalid action';
  end if;
  if p_action in ('create', 'edit') and (p_body is null or length(btrim(p_body, E' \t\r\n\v\f')) not between 1 and 4000) then
    raise sqlstate 'PT422' using message = 'Body must contain 1–4000 characters';
  end if;
  if p_action = 'create' then
    if p_key is null then raise sqlstate 'PT422' using message = 'Idempotency key required'; end if;
    payload := jsonb_build_object('entity', p_entity_id, 'parent', p_parent_id, 'body', p_body);
    perform pg_advisory_xact_lock(hashtextextended(actor::text || p_key::text, 0));
    select * into saved from private.mutation_keys where actor_id = actor and key = p_key;
    if found then
      if saved.payload <> payload then raise sqlstate 'PT409' using message = 'Idempotency key reused with different input'; end if;
      select * into item from public.comments where id = saved.comment_id;
      return item;
    end if;
    if p_entity_id is null or not private.entity_visible(p_entity_id) or not exists(select 1 from public.content_entities where id = p_entity_id) then
      raise sqlstate 'PT404' using message = 'Entity not found';
    end if;
    if p_parent_id is not null then
      select * into parent from public.comments where id = p_parent_id for share;
      if not found or parent.entity_id <> p_entity_id or parent.parent_id is not null or parent.deleted_at is not null
        or (not owner_actor and parent.status <> 'approved') then
        raise sqlstate 'PT422' using message = 'Parent must be a visible root in the same entity';
      end if;
    end if;
  else
    select * into item from public.comments where id = p_id for update;
    if not found then raise sqlstate 'PT404' using message = 'Comment not found'; end if;
    if p_action = 'moderate' then
      if not owner_actor then raise sqlstate 'PT403' using message = 'Owner required'; end if;
      if p_status is null or p_status not in ('approved', 'rejected', 'hidden')
        or p_reason is null or length(btrim(p_reason, E' \t\r\n\v\f')) not between 1 and 500 then
        raise sqlstate 'PT422' using message = 'Valid status and moderation reason required';
      end if;
    elsif item.author_id is distinct from actor then
      raise sqlstate 'PT403' using message = 'Author required';
    end if;
    if item.deleted_at is not null then raise sqlstate 'PT404' using message = 'Comment deleted'; end if;
    if p_expected_version is null or p_expected_version <> item.version then
      raise sqlstate 'PT409' using message = 'Version conflict';
    end if;
  end if;
  -- Atomic DB-side quota survives direct RPC and multiple Edge instances.
  insert into private.write_windows(actor_id, window_start, count)
    values(actor, date_trunc('minute', statement_timestamp()), 1)
    on conflict (actor_id, window_start) do update set count = private.write_windows.count + 1
    returning count into window_count;
  if window_count > (case when owner_actor then 120 else 30 end) then
    raise sqlstate 'PT429' using message = 'Mutation quota exceeded';
  end if;
  if p_action = 'create' then
    insert into public.comments(entity_id, author_id, parent_id, body, status)
      values(p_entity_id, actor, p_parent_id, p_body, case when owner_actor then 'approved' else 'pending' end) returning * into item;
    insert into private.mutation_keys values(actor, p_key, payload, item.id);
  elsif p_action = 'edit' then
    update public.comments set body = p_body, status = case when owner_actor then 'approved' else 'pending' end,
      version = version + 1, updated_at = now() where id = item.id returning * into item;
  elsif p_action = 'delete' then
    update public.comments set body = '', status = 'hidden', deleted_at = now(), updated_at = now(), version = version + 1
      where id = item.id returning * into item;
  else
    update public.comments set status = p_status, version = version + 1, updated_at = now()
      where id = item.id returning * into item;
  end if;
  insert into public.comment_revisions(comment_id, version, actor_id, body, status) values(item.id, item.version, actor, item.body, item.status);
  insert into public.audit_events(actor_id, comment_id, version, action, reason) values(actor, item.id, item.version, p_action, case when p_action = 'moderate' then p_reason end);
  return item;
end $$;

alter table private.help_requests enable row level security;
alter table private.request_scope_revisions enable row level security;
alter table private.request_events enable row level security;
revoke all on private.help_requests,private.request_scope_revisions,private.request_events from public,anon,authenticated;
revoke all on all functions in schema private from public;
grant execute on function private.entity_visible(uuid),private.request_read(text,uuid,integer,timestamptz,uuid,text),private.request_history(uuid,integer,integer) to anon,authenticated;
grant execute on function private.request_write(text,uuid,jsonb,integer,uuid,integer,text,text,text,uuid) to authenticated;
create function public.request_read(p_view text default 'public',p_id uuid default null,p_limit integer default 20,p_after_time timestamptz default null,p_after_id uuid default null,p_status text default null) returns jsonb language sql security invoker set search_path='' as $$select private.request_read(p_view,p_id,p_limit,p_after_time,p_after_id,p_status);$$;
create function public.request_history(p_id uuid,p_before integer default null,p_limit integer default 20) returns jsonb language sql security invoker set search_path='' as $$select private.request_history(p_id,p_before,p_limit);$$;
create function public.request_write(p_action text,p_id uuid default null,p_payload jsonb default null,p_expected_version integer default null,p_key uuid default null,p_scope_revision integer default null,p_status text default null,p_message text default null,p_result text default null,p_target uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.request_write(p_action,p_id,p_payload,p_expected_version,p_key,p_scope_revision,p_status,p_message,p_result,p_target);$$;
revoke all on function public.request_read(text,uuid,integer,timestamptz,uuid,text),public.request_history(uuid,integer,integer),public.request_write(text,uuid,jsonb,integer,uuid,integer,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.request_read(text,uuid,integer,timestamptz,uuid,text),public.request_history(uuid,integer,integer) to anon,authenticated;
grant execute on function public.request_write(text,uuid,jsonb,integer,uuid,integer,text,text,text,uuid) to authenticated;
