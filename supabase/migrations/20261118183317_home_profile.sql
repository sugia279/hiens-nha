-- Public presentation settings; private drafts/credentials never belong here.
create table private.home_profile (singleton boolean primary key default true check(singleton), version integer not null default 0, value jsonb);
insert into private.home_profile(singleton) values(true);
create table private.home_profile_audit (version integer primary key, actor_id uuid not null references public.profiles(id), value jsonb not null, created_at timestamptz not null default now());
alter table private.home_profile enable row level security;
alter table private.home_profile_audit enable row level security;
revoke all on private.home_profile, private.home_profile_audit from public,anon,authenticated;
create function private.home_profile_url(p_url text) returns boolean language sql immutable set search_path='' as $$
 select length(p_url) between 1 and 2048 and p_url !~ '[[:space:][:cntrl:]]' and position(chr(92) in p_url)=0 and p_url !~ '^https://[^/]*@' and
 (p_url like 'https://%' or (p_url like '/%' and p_url not like '//%'));
$$;
create function private.home_profile_read() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',version,'value',value) from private.home_profile where singleton;
$$;
create function private.home_profile_save(p_value jsonb,p_expected_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_version integer; field text;
begin
 if auth.uid() is null then raise sqlstate 'PT401' using message='Authentication required';end if;
 if not private.is_owner() then raise sqlstate 'PT403' using message='Owner required';end if;
 if jsonb_typeof(p_value) is distinct from 'object' or pg_column_size(p_value)>16000 then raise sqlstate 'PT422' using message='Invalid profile';end if;
 if exists(select 1 from jsonb_object_keys(p_value) k where k not in ('images','avatarUrl','frame','leadVi','leadEn','introVi','introEn')) then raise sqlstate 'PT422' using message='Unknown profile field';end if;
 if jsonb_typeof(p_value->'images') is distinct from 'array' then raise sqlstate 'PT422' using message='Images required';end if;
 if jsonb_array_length(p_value->'images') not between 1 and 4 or exists(select 1 from jsonb_array_elements(p_value->'images') i where jsonb_typeof(i)<>'string' or not coalesce(private.home_profile_url(i#>>'{}'),false)) then raise sqlstate 'PT422' using message='Choose one to four safe images';end if;
 foreach field in array array['avatarUrl','frame','leadVi','leadEn','introVi','introEn'] loop
  if jsonb_typeof(p_value->field) is distinct from 'string' then raise sqlstate 'PT422' using message='Text field required';end if;
 end loop;
 if not private.home_profile_url(p_value->>'avatarUrl') or p_value->>'frame' not in ('rounded','square','polaroid') then raise sqlstate 'PT422' using message='Invalid avatar or frame';end if;
 if length(p_value->>'leadVi') not between 1 and 160 or length(p_value->>'leadEn') not between 1 and 160 or length(p_value->>'introVi') not between 1 and 600 or length(p_value->>'introEn') not between 1 and 600 then raise sqlstate 'PT422' using message='Invalid introduction length';end if;
 select version into current_version from private.home_profile where singleton for update;
 if p_expected_version is null or p_expected_version<>current_version then raise sqlstate 'PT409' using message='Profile changed; reload before saving';end if;
 update private.home_profile set value=p_value,version=version+1 where singleton;
 insert into private.home_profile_audit(version,actor_id,value) values(current_version+1,auth.uid(),p_value);
 return private.home_profile_read();
end $$;
revoke all on function private.home_profile_url(text),private.home_profile_read(),private.home_profile_save(jsonb,integer) from public,anon,authenticated;
grant execute on function private.home_profile_read() to anon,authenticated;
grant execute on function private.home_profile_save(jsonb,integer) to authenticated;
create function public.home_profile_read() returns jsonb language sql stable security invoker set search_path='' as $$ select private.home_profile_read(); $$;
create function public.home_profile_save(p_value jsonb,p_expected_version integer) returns jsonb language sql security invoker set search_path='' as $$ select private.home_profile_save(p_value,p_expected_version); $$;
revoke all on function public.home_profile_read(),public.home_profile_save(jsonb,integer) from public,anon,authenticated;
grant execute on function public.home_profile_read() to anon,authenticated;
grant execute on function public.home_profile_save(jsonb,integer) to authenticated;
notify pgrst,'reload schema';
