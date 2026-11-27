-- Preserve create idempotency when OAuth changes the actor.
create or replace function private.guest_claim(p_proof uuid) returns boolean
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
 -- Carry actor-scoped retry receipts forward without overwriting destination keys.
 insert into private.mutation_keys(actor_id,key,payload,comment_id)
  select actor,key,payload,comment_id from private.mutation_keys where actor_id=item.actor_id
  on conflict(actor_id,key) do nothing;
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
