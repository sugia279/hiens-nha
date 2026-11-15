-- Only migrations/operator SQL may register entities or grant owner.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create table public.role_assignments (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  role text not null check (role = 'owner'),
  created_at timestamptz not null default now()
);
create table public.content_entities (
  id uuid primary key default gen_random_uuid(),
  collection text not null check (collection in ('page', 'articles', 'notes', 'projects', 'series')),
  legacy_key text not null check (length(legacy_key) between 1 and 500),
  canonical_path text not null unique check (canonical_path like '/%' and canonical_path not like '//%'),
  created_at timestamptz not null default now(),
  unique (collection, legacy_key)
);
create table public.legacy_mappings (
  source text not null,
  key text not null,
  entity_id uuid not null references public.content_entities(id) on delete restrict,
  primary key (source, key)
);
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.content_entities(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  parent_id uuid references public.comments(id) on delete restrict,
  body text not null,
  status text not null check (status in ('pending', 'approved', 'rejected', 'hidden')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((deleted_at is null and length(btrim(body, E' \t\r\n\v\f')) between 1 and 4000) or
    (deleted_at is not null and body = '' and status = 'hidden'))
);
create index comments_entity_cursor on public.comments(entity_id, created_at desc, id desc);
create index comments_author on public.comments(author_id, created_at desc, id desc);
create index comments_pending on public.comments(created_at desc, id desc) where status = 'pending' and deleted_at is null;
create index comments_parent on public.comments(parent_id) where parent_id is not null;
create table public.comment_revisions (
  comment_id uuid not null references public.comments(id) on delete restrict,
  version integer not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  body text not null,
  status text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, version)
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  comment_id uuid not null references public.comments(id) on delete restrict,
  version integer not null,
  action text not null,
  reason text,
  created_at timestamptz not null default now()
);
create table private.backend_settings (
  singleton boolean primary key default true check (singleton),
  comments_writes_enabled boolean not null default false
);
insert into private.backend_settings values (true, false);
create table private.mutation_keys (
  actor_id uuid not null references public.profiles(id),
  key uuid not null,
  payload jsonb not null,
  comment_id uuid not null references public.comments(id),
  primary key (actor_id, key)
);
create table private.write_windows (
  actor_id uuid not null references public.profiles(id),
  window_start timestamptz not null,
  count integer not null,
  primary key (actor_id, window_start)
);

-- Auth hook creates no elevated role and copies no untrusted metadata.
create function private.on_auth_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id) values (new.id) on conflict do nothing;
  return new;
end $$;
revoke all on function private.on_auth_user() from public, anon, authenticated;
create trigger backend_profile_created after insert on auth.users for each row execute function private.on_auth_user();
insert into public.profiles(id) select id from auth.users on conflict do nothing;

create function private.is_owner() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.role_assignments where user_id = (select auth.uid()) and role = 'owner');
$$;
create function private.root_public(root_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.comments where id = root_id and parent_id is null and status = 'approved' and deleted_at is null);
$$;
revoke all on function private.is_owner(), private.root_public(uuid) from public;
grant execute on function private.is_owner(), private.root_public(uuid) to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.role_assignments enable row level security;
alter table public.content_entities enable row level security;
alter table public.legacy_mappings enable row level security;
alter table public.comments enable row level security;
alter table public.comment_revisions enable row level security;
alter table public.audit_events enable row level security;
alter table private.backend_settings enable row level security;
alter table private.mutation_keys enable row level security;
alter table private.write_windows enable row level security;

create policy profile_read on public.profiles for select to authenticated using (id = (select auth.uid()) or (select private.is_owner()));
create policy role_read on public.role_assignments for select to authenticated using (user_id = (select auth.uid()));
create policy entity_read on public.content_entities for select to anon, authenticated using (true);
create policy comment_read on public.comments for select to anon, authenticated using (
  author_id = (select auth.uid()) or (select private.is_owner()) or
  (deleted_at is null and status = 'approved' and (parent_id is null or private.root_public(parent_id)))
);
create policy revision_read on public.comment_revisions for select to authenticated using (
  (select private.is_owner()) or exists(select 1 from public.comments c where c.id = comment_id and c.author_id = (select auth.uid()))
);
create policy audit_read on public.audit_events for select to authenticated using ((select private.is_owner()));

-- Explicitly replace Supabase's default grants. No direct content, audit, role or settings writes.
revoke all on public.profiles, public.role_assignments, public.content_entities, public.legacy_mappings,
  public.comments, public.comment_revisions, public.audit_events from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
grant select on public.content_entities, public.comments to anon, authenticated;
grant select on public.profiles, public.role_assignments, public.comment_revisions, public.audit_events to authenticated;

-- Authority lives here, in a non-exposed schema. Public RPCs are invoker-only wrappers.
create function private.write_comment(
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
  if not exists(select 1 from private.backend_settings where comments_writes_enabled) then
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
    elsif item.author_id <> actor then
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
revoke all on function private.write_comment(text,uuid,uuid,uuid,text,text,integer,uuid,text) from public, anon;
grant execute on function private.write_comment(text,uuid,uuid,uuid,text,text,integer,uuid,text) to authenticated;

create function public.create_comment(p_entity_id uuid, p_body text, p_key uuid, p_parent_id uuid default null)
returns public.comments language sql security invoker set search_path = '' as $$
  select private.write_comment('create', p_entity_id => p_entity_id, p_parent_id => p_parent_id, p_body => p_body, p_key => p_key);
$$;
create function public.edit_comment(p_id uuid, p_body text, p_expected_version integer)
returns public.comments language sql security invoker set search_path = '' as $$
  select private.write_comment('edit', p_id => p_id, p_body => p_body, p_expected_version => p_expected_version);
$$;
create function public.delete_comment(p_id uuid, p_expected_version integer)
returns public.comments language sql security invoker set search_path = '' as $$
  select private.write_comment('delete', p_id => p_id, p_expected_version => p_expected_version);
$$;
create function public.moderate_comment(p_id uuid, p_status text, p_expected_version integer, p_reason text)
returns public.comments language sql security invoker set search_path = '' as $$
  select private.write_comment('moderate', p_id => p_id, p_status => p_status, p_expected_version => p_expected_version, p_reason => p_reason);
$$;
revoke all on function public.create_comment(uuid,text,uuid,uuid), public.edit_comment(uuid,text,integer),
  public.delete_comment(uuid,integer), public.moderate_comment(uuid,text,integer,text) from public, anon;
grant execute on function public.create_comment(uuid,text,uuid,uuid), public.edit_comment(uuid,text,integer),
  public.delete_comment(uuid,integer), public.moderate_comment(uuid,text,integer,text) to authenticated;
