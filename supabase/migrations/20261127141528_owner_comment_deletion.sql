-- ADR0020: owner soft-delete; author-only edits and existing validation/audit/CAS/quota remain.
create or replace function private.write_comment_pre_guest(
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
  perform private.require_comment_writes();
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
    elsif item.author_id is distinct from actor and not (p_action = 'delete' and owner_actor) then
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
      values(p_entity_id, actor, p_parent_id, p_body, 'approved') returning * into item;
    insert into private.mutation_keys values(actor, p_key, payload, item.id);
  elsif p_action = 'edit' then
    update public.comments set body = p_body, status = case when item.status in ('hidden', 'rejected') then item.status else 'approved' end,
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
