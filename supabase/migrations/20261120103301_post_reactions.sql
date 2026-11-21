-- ADR0016: one caller-owned reaction per public post; no direct table access.
create table private.post_reactions (
 post_id uuid not null references private.publications(id),
 actor_id uuid not null references public.profiles(id),
 reaction text not null check(reaction in ('heart','laugh','wow')),
 primary key(post_id,actor_id)
);
create index post_reactions_actor on private.post_reactions(actor_id);
alter table private.post_reactions enable row level security;
revoke all on private.post_reactions from public,anon,authenticated;

create function private.post_reactions_summary(p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 select coalesce(jsonb_agg(summary),'[]') into result from (
  select p.id as post_id,
   count(*) filter(where r.reaction='heart') as heart,
   count(*) filter(where r.reaction='laugh') as laugh,
   count(*) filter(where r.reaction='wow') as wow,
   max(r.reaction) filter(where r.actor_id=auth.uid()) as mine
  from private.publications p left join private.post_reactions r on r.post_id=p.id
  where p.id=any(p_ids) and p.feature='posts' and p.deleted_at is null and p.published_revision is not null
  group by p.id
 ) summary;
 return result;
end $$;
revoke all on function private.post_reactions_summary(uuid[]) from public,anon,authenticated;

create function private.post_reactions_read(p_ids uuid[]) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
 perform private.admit_read();
 if p_ids is null or cardinality(p_ids)>50 then raise sqlstate 'PT422' using message='Use at most 50 post IDs';end if;
 return private.post_reactions_summary(p_ids);
end $$;

create function private.post_reaction_set(p_id uuid,p_reaction text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item private.publications;
begin
 if actor is null then raise sqlstate 'PT401' using message='Authentication required';end if;
 -- Same lock order as all other write wrappers: admission before feature/post locks.
 perform private.admit_read();
 perform private.feature_guard('posts');
 if p_reaction is not null and p_reaction not in ('heart','laugh','wow') then raise sqlstate 'PT422' using message='Invalid reaction';end if;
 -- Publication lock also serializes with delete/unpublish. The actor never comes from input.
 select * into item from private.publications where id=p_id for share;
 if not found or item.feature<>'posts' or item.deleted_at is not null or item.published_revision is null then
  raise sqlstate 'PT404' using message='Public post not found';end if;
 if p_reaction is null then
  delete from private.post_reactions where post_id=p_id and actor_id=actor;
 else
  insert into private.post_reactions values(p_id,actor,p_reaction)
  on conflict(post_id,actor_id) do update set reaction=excluded.reaction;
 end if;
 return private.post_reactions_summary(array[p_id])->0;
end $$;
revoke all on function private.post_reactions_read(uuid[]),private.post_reaction_set(uuid,text) from public,anon,authenticated;
grant execute on function private.post_reactions_read(uuid[]) to anon,authenticated;
grant execute on function private.post_reaction_set(uuid,text) to authenticated;
create function public.post_reactions_read(p_ids uuid[]) returns jsonb language sql volatile security invoker set search_path='' as $$select private.post_reactions_read(p_ids);$$;
create function public.post_reaction_set(p_id uuid,p_reaction text) returns jsonb language sql volatile security invoker set search_path='' as $$select private.post_reaction_set(p_id,p_reaction);$$;
revoke all on function public.post_reactions_read(uuid[]),public.post_reaction_set(uuid,text) from public,anon,authenticated;
grant execute on function public.post_reactions_read(uuid[]) to anon,authenticated;
grant execute on function public.post_reaction_set(uuid,text) to authenticated;
notify pgrst,'reload schema';
