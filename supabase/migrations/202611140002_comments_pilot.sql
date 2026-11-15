-- Phase 2 expansion: no production source switch, no destructive down migration.
alter table private.backend_settings add column comments_source text not null default 'git' check (comments_source in ('git','api'));
alter table private.backend_settings add column comments_epoch integer not null default 0 check (comments_epoch >= 0);
alter table public.comments alter column author_id drop not null;
alter table public.comments add column legacy_author_login text;
alter table public.comments add column legacy_url text;
alter table public.comment_revisions alter column actor_id drop not null;
alter table public.audit_events alter column actor_id drop not null;
create table private.legacy_comment_records (
  source text not null,
  key text not null,
  comment_id uuid not null unique references public.comments(id),
  checksum text not null,
  raw_record jsonb not null,
  primary key(source,key)
);
create table private.import_runs (
  checksum text primary key,
  source_commit text not null,
  record_count integer not null,
  imported_at timestamptz not null default now()
);
alter table private.legacy_comment_records enable row level security;
alter table private.import_runs enable row level security;
revoke all on private.legacy_comment_records, private.import_runs from public, anon, authenticated;
create function private.comment_state() returns table(source text, epoch integer, writes_enabled boolean)
  language sql stable security definer set search_path = '' as $$
  select comments_source, comments_epoch, comments_writes_enabled from private.backend_settings where singleton;
$$;
revoke all on function private.comment_state() from public;
grant execute on function private.comment_state() to anon, authenticated;
create function public.comment_state() returns table(source text, epoch integer, writes_enabled boolean)
  language sql stable security invoker set search_path = '' as $$ select * from private.comment_state(); $$;
revoke all on function public.comment_state() from public;
grant execute on function public.comment_state() to anon, authenticated;

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
    if p_entity_id is null or not exists(select 1 from public.content_entities where id = p_entity_id) then
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
