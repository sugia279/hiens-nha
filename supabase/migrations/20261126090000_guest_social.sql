-- ADR0019. Caller JWTs only; deny guest access outside public social interactions.
create function private.is_guest() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u where u.id=auth.uid() and coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false));
$$;
revoke all on function private.is_guest() from public,anon,authenticated;
create or replace function private.is_owner() returns boolean language sql stable security definer set search_path='' as $$
 select not private.is_guest() and exists(select 1 from public.role_assignments where user_id=auth.uid() and role='owner');
$$;
create function private.require_member() returns void language plpgsql stable security definer set search_path='' as $$
begin if private.is_guest() then raise sqlstate 'PT403' using message='Verified account required';end if;end $$;
revoke all on function private.require_member() from public,anon,authenticated;
create table private.guest_profiles (
 actor_id uuid primary key references public.profiles(id),
 display_name text not null default 'Người Lạ' check(length(display_name) between 1 and 60 and display_name !~ '[[:cntrl:]]'),
 chosen boolean not null default false,
 linked_to uuid references public.profiles(id),
 proof_hash bytea, proof_expires timestamptz,
 check(actor_id is distinct from linked_to)
);
alter table private.guest_profiles enable row level security;
revoke all on private.guest_profiles from public,anon,authenticated;
create function private.guest_active() returns void language plpgsql stable security definer set search_path='' as $$
begin if private.is_guest() and exists(select 1 from private.guest_profiles where actor_id=auth.uid() and linked_to is not null) then raise sqlstate 'PT403' using message='Guest session transferred';end if;end $$;
revoke all on function private.guest_active() from public,anon,authenticated;
create function private.public_social_entity(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.content_entities e where e.id=p_id and private.entity_visible(e.id))
 and not exists(select 1 from private.publications p where p.entity_id=p_id and (p.deleted_at is not null or p.published_revision is null))
 and not exists(select 1 from private.help_requests r where r.entity_id=p_id and (r.deleted_at is not null or r.moderation<>'approved'));
$$;
revoke all on function private.public_social_entity(uuid) from public,anon,authenticated;
-- Guard the existing domain functions. Preserve validation/CAS/retry/admission/quotas.
alter function private.publication_write(text,text,uuid,jsonb,integer,uuid,integer,text) rename to publication_write_pre_guest;
revoke all on function private.publication_write_pre_guest(text,text,uuid,jsonb,integer,uuid,integer,text) from public,anon,authenticated;
create function private.publication_write(p_feature text,p_action text,p_id uuid default null,p_payload jsonb default null,p_expected_version integer default null,p_key uuid default null,p_revision integer default null,p_reason text default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
 perform private.require_member();
 return private.publication_write_pre_guest(p_feature,p_action,p_id,p_payload,p_expected_version,p_key,p_revision,p_reason);
end $$;
revoke all on function private.publication_write(text,text,uuid,jsonb,integer,uuid,integer,text) from public,anon,authenticated;
grant execute on function private.publication_write(text,text,uuid,jsonb,integer,uuid,integer,text) to authenticated;

alter function private.request_write(text,uuid,jsonb,integer,uuid,integer,text,text,text,uuid) rename to request_write_pre_guest;
revoke all on function private.request_write_pre_guest(text,uuid,jsonb,integer,uuid,integer,text,text,text,uuid) from public,anon,authenticated;
create function private.request_write(p_action text,p_id uuid default null,p_payload jsonb default null,p_expected_version integer default null,p_key uuid default null,p_scope_revision integer default null,p_status text default null,p_message text default null,p_result text default null,p_target uuid default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
 perform private.require_member();
 return private.request_write_pre_guest(p_action,p_id,p_payload,p_expected_version,p_key,p_scope_revision,p_status,p_message,p_result,p_target);
end $$;
revoke all on function private.request_write(text,uuid,jsonb,integer,uuid,integer,text,text,text,uuid) from public,anon,authenticated;
grant execute on function private.request_write(text,uuid,jsonb,integer,uuid,integer,text,text,text,uuid) to authenticated;

alter function private.content_category_create(text,text) rename to content_category_create_pre_guest;
revoke all on function private.content_category_create_pre_guest(text,text) from public,anon,authenticated;
create function private.content_category_create(p_scope text,p_label text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
 perform private.require_member();
 return private.content_category_create_pre_guest(p_scope,p_label);
end $$;
revoke all on function private.content_category_create(text,text) from public,anon,authenticated;
grant execute on function private.content_category_create(text,text) to authenticated;

alter function private.post_reaction_set(uuid,text) rename to post_reaction_set_pre_guest;
revoke all on function private.post_reaction_set_pre_guest(uuid,text) from public,anon,authenticated;
create function private.post_reaction_set(p_id uuid,p_reaction text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
 perform private.guest_active();
 return private.post_reaction_set_pre_guest(p_id,p_reaction);
end $$;
revoke all on function private.post_reaction_set(uuid,text) from public,anon,authenticated;
grant execute on function private.post_reaction_set(uuid,text) to authenticated;

alter function private.write_comment(text,uuid,uuid,uuid,text,text,integer,uuid,text) rename to write_comment_pre_guest;
revoke all on function private.write_comment_pre_guest(text,uuid,uuid,uuid,text,text,integer,uuid,text) from public,anon,authenticated;
create function private.write_comment(p_action text,p_id uuid default null,p_entity_id uuid default null,p_parent_id uuid default null,p_body text default null,p_status text default null,p_expected_version integer default null,p_key uuid default null,p_reason text default null) returns public.comments
language plpgsql volatile security definer set search_path='' as $$
begin
 perform private.guest_active();
 if private.is_guest() then
  if p_action='moderate' then raise sqlstate 'PT403' using message='Owner required';end if;
  if p_action='create' then
   if not private.public_social_entity(p_entity_id) then raise sqlstate 'PT404' using message='Public entity not found';end if;
  elsif not exists(select 1 from public.comments c where c.id=p_id and private.public_social_entity(c.entity_id)) then
   raise sqlstate 'PT404' using message='Public comment not found';
  end if;
 end if;
 return private.write_comment_pre_guest(p_action,p_id,p_entity_id,p_parent_id,p_body,p_status,p_expected_version,p_key,p_reason);
end $$;
revoke all on function private.write_comment(text,uuid,uuid,uuid,text,text,integer,uuid,text) from public,anon,authenticated;
grant execute on function private.write_comment(text,uuid,uuid,uuid,text,text,integer,uuid,text) to authenticated;
