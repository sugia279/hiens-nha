-- Native image encoding fallback and 50 MiB files; existing permissions retained.
alter table private.media_resources drop constraint media_resources_max_bytes_check;
alter table private.media_resources add constraint media_resources_max_bytes_check check(max_bytes between 1 and 52428800);
update private.media_resources set max_bytes=52428800 where id='primary-media';
create or replace function private.post_social(value jsonb,actor uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare base jsonb;m jsonb;refs jsonb:='[]';n integer;layout text;frame text;r private.media_resources;obj record;media_kind text;sz bigint;mime text;
begin
 if value='{}' then return value;end if;
 base:=private.post_social_v1(value-array['media','layout','frame'],actor);
 if value ? 'media' then
  if jsonb_typeof(value->'media') is distinct from 'array' then raise sqlstate 'PT422' using message='Invalid media array';end if;
  for m in select * from jsonb_array_elements(value->'media') loop
   if jsonb_typeof(m)<>'object' or exists(select 1 from jsonb_object_keys(m) k where k<>all(array['resourceId','path','kind'])) or jsonb_typeof(m->'resourceId') is distinct from 'string' or jsonb_typeof(m->'path') is distinct from 'string' or jsonb_typeof(m->'kind') is distinct from 'string' then raise sqlstate 'PT422' using message='Invalid media reference';end if;
   media_kind:=m->>'kind';
   if media_kind not in ('image','video') or (m->>'path') !~ ('^'||actor::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'||case when media_kind='image' then '\.(webp|jpg)$' else '\.(mp4|webm|mov)$' end) then raise sqlstate 'PT422' using message='Invalid media path';end if;
   if exists(select 1 from jsonb_array_elements(refs) x where x->>'resourceId'=m->>'resourceId' and x->>'path'=m->>'path') or (m->>'resourceId'='primary-images' and base->'images' @> jsonb_build_array(m->>'path')) then raise sqlstate 'PT422' using message='Duplicate media';end if;
   select * into r from private.media_resources where id=m->>'resourceId' and enabled and provider='supabase' and endpoint is null;
   if not found then raise sqlstate 'PT422' using message='Media resource unavailable';end if;
   select metadata into obj from storage.objects where bucket_id=r.bucket and name=m->>'path';
   if not found then raise sqlstate 'PT422' using message='Upload media first';end if;
   sz:=(obj.metadata->>'size')::bigint;mime:=obj.metadata->>'mimetype';
   if sz is null or sz<1 or sz>r.max_bytes or (media_kind='image' and (sz>2097152 or mime is distinct from case when (m->>'path') like '%.jpg' then 'image/jpeg' else 'image/webp' end)) or (media_kind='video' and mime is distinct from case when (m->>'path') like '%.mp4' then 'video/mp4' when (m->>'path') like '%.mov' then 'video/quicktime' else 'video/webm' end) then raise sqlstate 'PT422' using message='Invalid media metadata';end if;
   if not r.writable and not exists(select 1 from private.media_assets where resource_id=r.id and path=m->>'path' and owner_id=actor) and r.id<>'primary-images' then raise sqlstate 'PT422' using message='Resource is read only';end if;
   insert into private.media_assets(resource_id,path,owner_id,kind,mime_type,byte_size) values(r.id,m->>'path',actor,media_kind,mime,sz) on conflict do nothing;
   refs:=refs||jsonb_build_array(m);
  end loop;
  base:=base||jsonb_build_object('media',refs);
 end if;
 n:=jsonb_array_length(base->'images')+jsonb_array_length(refs);
 if n>4 then raise sqlstate 'PT422' using message='Maximum four attachments';end if;
 if value ? 'layout' then
  layout:=value->>'layout';
  if jsonb_typeof(value->'layout')<>'string' or layout<>all(array['auto','single-square','single-landscape','single-event','single-link','single-story','two-square','two-portrait','two-landscape','three-square','three-left','three-top','four-grid','four-left','four-top']) or (layout<>'auto' and (n=0 or split_part(layout,'-',1) is distinct from (array['single','two','three','four'])[n])) then raise sqlstate 'PT422' using message='Invalid media layout';end if;
  base:=base||jsonb_build_object('layout',layout);
 end if;
 if value ? 'frame' then
  frame:=value->>'frame';if jsonb_typeof(value->'frame')<>'string' or frame<>all(array['rounded','square','polaroid']) then raise sqlstate 'PT422' using message='Invalid frame';end if;
  base:=base||jsonb_build_object('frame',frame);
 end if;
 return base;
end $$;
revoke all on function private.post_social(jsonb,uuid) from public,anon,authenticated;

create or replace function private.post_media_owner(path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.is_owner() and path ~ ('^'||auth.uid()::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|mp4|webm|mov)$');
$$;
create or replace function private.provision_post_storage() returns void language plpgsql security invoker set search_path='' as $$
begin
 perform private.provision_post_storage_v1();
 insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('post-media','post-media',false,52428800,array['image/webp','image/jpeg','video/mp4','video/webm','video/quicktime']) on conflict(id) do nothing;
 update storage.buckets set file_size_limit=52428800,allowed_mime_types=array['image/webp','image/jpeg','video/mp4','video/webm','video/quicktime'] where id='post-media';
 drop policy if exists post_media_insert on storage.objects;
 drop policy if exists post_media_read on storage.objects;
 drop policy if exists post_media_remove_unused on storage.objects;
 create policy post_media_insert on storage.objects for insert to authenticated with check(bucket_id='post-media' and private.post_media_owner(name) and exists(select 1 from public.post_media_resources() data,jsonb_array_elements(data) r where r->>'id'='primary-media' and (r->>'writable')::boolean));
 create policy post_media_read on storage.objects for select to anon,authenticated using(bucket_id='post-media' and (private.post_media_owner(name) or private.post_media_public('primary-media',name)));
 create policy post_media_remove_unused on storage.objects for delete to authenticated using(bucket_id='post-media' and private.post_media_owner(name) and private.post_media_unused('primary-media',name));
end $$;
do $$begin if to_regclass('storage.objects') is not null then perform private.provision_post_storage();end if;end $$;
notify pgrst,'reload schema';
