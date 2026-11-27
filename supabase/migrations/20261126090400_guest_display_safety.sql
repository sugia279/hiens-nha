-- Normalize Unicode whitespace with the existing domain helper.
-- Never publish provider avatar URL query credentials or fragments.
create or replace function private.guest_identity(p_name text default null,p_choose boolean default false,p_proof uuid default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare item private.guest_profiles; used integer;
begin
 perform private.admit_read();
 if auth.uid() is null or not private.is_guest() then raise sqlstate 'PT403' using message='Guest required';end if;
 perform private.guest_active();
 if p_choose is null or (p_name is not null and (length(private.trim_text(p_name)) not between 1 and 60 or p_name ~ '[[:cntrl:]]')) then
  raise sqlstate 'PT422' using message='Use 1-60 characters';end if;
 if p_choose or p_proof is not null then
  insert into private.write_windows values(auth.uid(),date_trunc('minute',statement_timestamp()),1)
  on conflict(actor_id,window_start) do update set count=private.write_windows.count+1 returning count into used;
  if used>30 then raise sqlstate 'PT429' using message='Mutation quota exceeded';end if;
 end if;
 insert into private.guest_profiles(actor_id) values(auth.uid()) on conflict do nothing;
 update private.guest_profiles set
  display_name=case when p_choose then coalesce(private.trim_text(p_name),'Người Lạ') else display_name end,
  chosen=chosen or p_choose,
  proof_hash=case when p_proof is not null then sha256(convert_to(p_proof::text,'UTF8')) else proof_hash end,
  proof_expires=case when p_proof is not null then now()+interval '5 minutes' else proof_expires end
 where actor_id=auth.uid() returning * into item;
 return jsonb_build_object('display_name',item.display_name,'chosen',item.chosen);
end $$;
create or replace function private.social_display(p_actor uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'display_name',case when coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false) then coalesce(g.display_name,'Người Lạ')
   else coalesce(nullif(left(btrim(u.raw_user_meta_data->>'full_name'),60),''),nullif(left(btrim(u.raw_user_meta_data->>'name'),60),''),nullif(left(btrim(u.raw_user_meta_data->>'user_name'),60),''),'Người Lạ') end,
  'avatar_url',case when not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)
    and coalesce(u.raw_user_meta_data->>'avatar_url',u.raw_user_meta_data->>'picture') ~ '^https://(avatars[.]githubusercontent[.]com|lh[0-9]+[.]googleusercontent[.]com|graph[.]facebook[.]com|[a-zA-Z0-9.-]+[.]fbcdn[.]net)/'
    then left(regexp_replace(coalesce(u.raw_user_meta_data->>'avatar_url',u.raw_user_meta_data->>'picture'),'[?#].*$',''),2048) else null end)
 from auth.users u left join private.guest_profiles g on g.actor_id=u.id where u.id=p_actor;
$$;
