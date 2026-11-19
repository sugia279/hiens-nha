-- Optional layout field; existing profiles without it remain valid.
-- No data writes, permission changes or feature source changes.
create or replace function private.home_profile_save(p_value jsonb,p_expected_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_version integer; field text;
begin
 if auth.uid() is null then raise sqlstate 'PT401' using message='Authentication required';end if;
 if not private.is_owner() then raise sqlstate 'PT403' using message='Owner required';end if;
 if jsonb_typeof(p_value) is distinct from 'object' or pg_column_size(p_value)>16000 then raise sqlstate 'PT422' using message='Invalid profile';end if;
 if exists(select 1 from jsonb_object_keys(p_value) k where k not in ('images','avatarUrl','frame','layout','leadVi','leadEn','introVi','introEn')) then raise sqlstate 'PT422' using message='Unknown profile field';end if;
 if jsonb_typeof(p_value->'images') is distinct from 'array' then raise sqlstate 'PT422' using message='Images required';end if;
 if jsonb_array_length(p_value->'images') not between 1 and 4 or exists(select 1 from jsonb_array_elements(p_value->'images') i where jsonb_typeof(i)<>'string' or not coalesce(private.home_profile_url(i#>>'{}'),false)) then raise sqlstate 'PT422' using message='Choose one to four safe images';end if;
 if p_value ? 'layout' then
  if jsonb_typeof(p_value->'layout') is distinct from 'string' or not (p_value->>'layout'=any(array['auto','single-square','single-landscape','single-event','single-link','single-story','two-square','two-portrait','two-landscape','three-square','three-left','three-top','four-grid','four-left','four-top'])) then raise sqlstate 'PT422' using message='Invalid layout';end if;
  if p_value->>'layout'<>'auto' and jsonb_array_length(p_value->'images')<>(case split_part(p_value->>'layout','-',1) when 'single' then 1 when 'two' then 2 when 'three' then 3 when 'four' then 4 end) then raise sqlstate 'PT422' using message='Layout does not match photo count';end if;
 end if;
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
notify pgrst,'reload schema';
