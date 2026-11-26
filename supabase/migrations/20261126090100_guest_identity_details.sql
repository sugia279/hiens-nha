-- Display data and proof of possession for guest -> verified account transitions.
create function private.guest_identity(p_name text default null,p_choose boolean default false,p_proof uuid default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare item private.guest_profiles; used integer;
begin
 perform private.admit_read();
 if auth.uid() is null or not private.is_guest() then raise sqlstate 'PT403' using message='Guest required';end if;
 perform private.guest_active();
 if p_choose is null or (p_name is not null and (length(btrim(p_name)) not between 1 and 60 or p_name ~ '[[:cntrl:]]')) then
  raise sqlstate 'PT422' using message='Use 1-60 characters';end if;
 if p_choose or p_proof is not null then
  insert into private.write_windows values(auth.uid(),date_trunc('minute',statement_timestamp()),1)
  on conflict(actor_id,window_start) do update set count=private.write_windows.count+1 returning count into used;
  if used>30 then raise sqlstate 'PT429' using message='Mutation quota exceeded';end if;
 end if;
 insert into private.guest_profiles(actor_id) values(auth.uid()) on conflict do nothing;
 update private.guest_profiles set
  display_name=case when p_choose then coalesce(btrim(p_name),'Người Lạ') else display_name end,
  chosen=chosen or p_choose,
  proof_hash=case when p_proof is not null then sha256(convert_to(p_proof::text,'UTF8')) else proof_hash end,
  proof_expires=case when p_proof is not null then now()+interval '5 minutes' else proof_expires end
 where actor_id=auth.uid() returning * into item;
 return jsonb_build_object('display_name',item.display_name,'chosen',item.chosen);
end $$;

create function private.guest_claim(p_proof uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare item private.guest_profiles; actor uuid:=auth.uid();
begin
 perform private.admit_read();
 if actor is null or private.is_guest() then raise sqlstate 'PT403' using message='Verified account required';end if;
 select * into item from private.guest_profiles where proof_hash=sha256(convert_to(p_proof::text,'UTF8')) for update;
 if not found or item.proof_expires<now() or (item.linked_to is not null and item.linked_to<>actor) then
  raise sqlstate 'PT403' using message='Invalid handoff';end if;
 if item.linked_to=actor then return true;end if;
 if exists(select 1 from public.comments where author_id=item.actor_id) then perform private.require_comment_writes();end if;
 if exists(select 1 from private.post_reactions where actor_id=item.actor_id) then perform private.require_feature_writes('posts');end if;
 -- Preserve historical actor/revision/audit records. Only current ownership changes.
 update public.comments set author_id=actor where author_id=item.actor_id;
 -- One reaction per destination; its existing selection wins a conflict.
 insert into private.post_reactions(post_id,actor_id,reaction)
  select post_id,actor,reaction from private.post_reactions where actor_id=item.actor_id
  on conflict(post_id,actor_id) do nothing;
 delete from private.post_reactions where actor_id=item.actor_id;
 update private.guest_profiles set linked_to=actor,chosen=true where actor_id=item.actor_id;
 return true;
end $$;

create function private.social_display(p_actor uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'display_name',case when coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false) then coalesce(g.display_name,'Người Lạ')
   else coalesce(nullif(left(btrim(u.raw_user_meta_data->>'full_name'),60),''),nullif(left(btrim(u.raw_user_meta_data->>'name'),60),''),nullif(left(btrim(u.raw_user_meta_data->>'user_name'),60),''),'Người Lạ') end,
  'avatar_url',case when not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)
    and coalesce(u.raw_user_meta_data->>'avatar_url',u.raw_user_meta_data->>'picture') ~ '^https://(avatars[.]githubusercontent[.]com|lh[0-9]+[.]googleusercontent[.]com|graph[.]facebook[.]com|[a-zA-Z0-9.-]+[.]fbcdn[.]net)/'
    then left(coalesce(u.raw_user_meta_data->>'avatar_url',u.raw_user_meta_data->>'picture'),2048) else null end)
 from auth.users u left join private.guest_profiles g on g.actor_id=u.id where u.id=p_actor;
$$;

create unique index guest_handoff_proof on private.guest_profiles(proof_hash) where proof_hash is not null;

alter table private.post_reactions add column public_cursor uuid not null default gen_random_uuid();
create unique index post_reaction_cursor on private.post_reactions(post_id,public_cursor);
create function private.post_reaction_details(p_id uuid,p_after uuid default null,p_limit integer default 25) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare result jsonb; next_page uuid;
begin
 perform private.admit_read();
 if p_limit is null or p_limit not between 1 and 50 then raise sqlstate 'PT422' using message='Use 1-50 rows';end if;
 if not exists(select 1 from private.publications where id=p_id and feature='posts' and deleted_at is null and published_revision is not null) then
  raise sqlstate 'PT404' using message='Public post not found';end if;
 select coalesce(jsonb_agg(data order by public_cursor),'[]') into result from (
  select private.social_display(actor_id)||jsonb_build_object('reaction',reaction) as data,public_cursor
  from private.post_reactions where post_id=p_id and (p_after is null or public_cursor>p_after)
  order by public_cursor limit p_limit
 ) page;
 select public_cursor into next_page from private.post_reactions where post_id=p_id and (p_after is null or public_cursor>p_after) order by public_cursor offset p_limit-1 limit 1;
 if not exists(select 1 from private.post_reactions where post_id=p_id and public_cursor>next_page) then next_page:=null;end if;
 return jsonb_build_object('items',result,'nextCursor',next_page);
end $$;

-- Extend the existing read DTO additively, preserving all visibility and ordering.
alter function private.comment_projection(uuid,timestamptz,uuid,integer,uuid,boolean,boolean,boolean) rename to comment_projection_v1;
create function private.comment_projection(p_entity_id uuid default null,p_after_time timestamptz default null,p_after_id uuid default null,
 p_limit integer default 20,p_parent_id uuid default null,p_mine boolean default false,p_feed boolean default false,p_shadow boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare rows jsonb;
begin
 rows:=private.comment_projection_v1(p_entity_id,p_after_time,p_after_id,p_limit,p_parent_id,p_mine,p_feed,p_shadow);
 return (select coalesce(jsonb_agg(c||coalesce(private.social_display((c->>'author_id')::uuid),'{}') order by n),'[]') from jsonb_array_elements(rows) with ordinality e(c,n));
end $$;
revoke all on function private.comment_projection(uuid,timestamptz,uuid,integer,uuid,boolean,boolean,boolean),private.comment_projection_v1(uuid,timestamptz,uuid,integer,uuid,boolean,boolean,boolean),private.social_display(uuid) from public,anon,authenticated;
revoke all on function private.guest_identity(text,boolean,uuid),private.guest_claim(uuid),private.post_reaction_details(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function private.guest_identity(text,boolean,uuid),private.guest_claim(uuid) to authenticated;
grant execute on function private.post_reaction_details(uuid,uuid,integer) to anon,authenticated;
create function public.guest_identity(p_name text default null,p_choose boolean default false,p_proof uuid default null) returns jsonb language sql volatile security invoker set search_path='' as $$select private.guest_identity(p_name,p_choose,p_proof)$$;
create function public.guest_claim(p_proof uuid) returns boolean language sql volatile security invoker set search_path='' as $$select private.guest_claim(p_proof)$$;
create function public.post_reaction_details(p_id uuid,p_after uuid default null,p_limit integer default 25) returns jsonb language sql volatile security invoker set search_path='' as $$select private.post_reaction_details(p_id,p_after,p_limit)$$;
revoke all on function public.guest_identity(text,boolean,uuid),public.guest_claim(uuid),public.post_reaction_details(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.guest_identity(text,boolean,uuid),public.guest_claim(uuid) to authenticated;
grant execute on function public.post_reaction_details(uuid,uuid,integer) to anon,authenticated;
notify pgrst,'reload schema';
