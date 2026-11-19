-- Resource identity is stable across URL/key rotation. Credentials live in secrets, not rows.
create table private.media_resources(
 id text primary key check(id ~ '^[-a-z0-9]{1,60}$'),
 provider text not null check(provider in ('supabase','r2')),
 endpoint text check(endpoint is null or endpoint ~ '^https://'),
 bucket text not null check(bucket ~ '^[-a-z0-9]{1,63}$'),
 credential_ref text,
 enabled boolean not null default false,
 writable boolean not null default false,
 priority integer not null default 100,
 capacity_bytes bigint check(capacity_bytes>0),
 max_bytes bigint not null check(max_bytes between 1 and 20971520),
 created_at timestamptz not null default now()
);
alter table private.media_resources enable row level security;
revoke all on private.media_resources from public,anon,authenticated;
insert into private.media_resources(id,provider,bucket,enabled,writable,priority,max_bytes)
 values('primary-images','supabase','post-images',true,false,100,2097152),('primary-media','supabase','post-media',true,true,10,20971520);
create table private.media_assets(
 resource_id text references private.media_resources(id),path text not null,
 owner_id uuid not null references auth.users(id),kind text not null check(kind in ('image','video')),
 mime_type text not null,byte_size bigint not null check(byte_size>0),created_at timestamptz not null default now(),
 primary key(resource_id,path)
);
alter table private.media_assets enable row level security;
revoke all on private.media_assets from public,anon,authenticated;
-- Only local adapters are active in this release. Do not expose credential refs.
create function private.post_media_resources() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'bucket',bucket,'maxBytes',max_bytes,'writable',writable) order by priority,id),'[]') from private.media_resources where enabled and provider='supabase' and endpoint is null;
$$;
revoke all on function private.post_media_resources() from public,anon,authenticated;
grant execute on function private.post_media_resources() to anon,authenticated;
create function public.post_media_resources() returns jsonb language sql stable security invoker set search_path='' as $$select private.post_media_resources()$$;
revoke all on function public.post_media_resources() from public;
grant execute on function public.post_media_resources() to anon,authenticated;

alter function private.post_social(jsonb,uuid) rename to post_social_v1;
create function private.post_social(value jsonb,actor uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare base jsonb;m jsonb;refs jsonb:='[]';n integer;layout text;frame text;r private.media_resources;obj record;media_kind text;sz bigint;mime text;
begin
 if value='{}' then return value;end if;
 base:=private.post_social_v1(value-array['media','layout','frame'],actor);
 if value ? 'media' then
  if jsonb_typeof(value->'media') is distinct from 'array' then raise sqlstate 'PT422' using message='Invalid media array';end if;
  for m in select * from jsonb_array_elements(value->'media') loop
   if jsonb_typeof(m)<>'object' or exists(select 1 from jsonb_object_keys(m) k where k<>all(array['resourceId','path','kind'])) or jsonb_typeof(m->'resourceId') is distinct from 'string' or jsonb_typeof(m->'path') is distinct from 'string' or jsonb_typeof(m->'kind') is distinct from 'string' then raise sqlstate 'PT422' using message='Invalid media reference';end if;
   media_kind:=m->>'kind';
   if media_kind not in ('image','video') or (m->>'path') !~ ('^'||actor::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'||case when media_kind='image' then '\.webp$' else '\.(mp4|webm)$' end) then raise sqlstate 'PT422' using message='Invalid media path';end if;
   if exists(select 1 from jsonb_array_elements(refs) x where x->>'resourceId'=m->>'resourceId' and x->>'path'=m->>'path') or (m->>'resourceId'='primary-images' and base->'images' @> jsonb_build_array(m->>'path')) then raise sqlstate 'PT422' using message='Duplicate media';end if;
   select * into r from private.media_resources where id=m->>'resourceId' and enabled and provider='supabase' and endpoint is null;
   if not found then raise sqlstate 'PT422' using message='Media resource unavailable';end if;
   select metadata into obj from storage.objects where bucket_id=r.bucket and name=m->>'path';
   if not found then raise sqlstate 'PT422' using message='Upload media first';end if;
   sz:=(obj.metadata->>'size')::bigint;mime:=obj.metadata->>'mimetype';
   if sz is null or sz<1 or sz>r.max_bytes or (media_kind='image' and (sz>2097152 or mime is distinct from 'image/webp')) or (media_kind='video' and mime is distinct from case when (m->>'path') like '%.mp4' then 'video/mp4' else 'video/webm' end) then raise sqlstate 'PT422' using message='Invalid media metadata';end if;
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

create function private.post_media_owner(path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.is_owner() and path ~ ('^'||auth.uid()::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|mp4|webm)$');
$$;
create function private.post_media_public(resource text,path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.publications p join private.publication_revisions r on r.publication_id=p.id and r.revision=p.published_revision where p.feature='posts' and p.deleted_at is null and r.social->'media' @> jsonb_build_array(jsonb_build_object('resourceId',resource,'path',path)));
$$;
create function private.post_media_unused(resource text,path text) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.publication_revisions r where r.social->'media' @> jsonb_build_array(jsonb_build_object('resourceId',resource,'path',path)));
$$;
-- Legacy images may be retained as resource references when editing old posts.
create or replace function private.post_image_public(path text) returns boolean language sql stable security definer set search_path='' as $$
 select private.post_media_public('primary-images',path) or exists(select 1 from private.publications p join private.publication_revisions r on r.publication_id=p.id and r.revision=p.published_revision where p.feature='posts' and p.deleted_at is null and r.social->'images' @> jsonb_build_array(path));
$$;
create or replace function private.post_image_unused(path text) returns boolean language sql stable security definer set search_path='' as $$
 select private.post_media_unused('primary-images',path) and not exists(select 1 from private.publication_revisions r where r.social->'images' @> jsonb_build_array(path));
$$;
revoke all on function private.post_media_owner(text),private.post_media_public(text,text),private.post_media_unused(text,text) from public,anon,authenticated;
grant execute on function private.post_media_owner(text),private.post_media_public(text,text) to anon,authenticated;
grant execute on function private.post_media_unused(text,text) to authenticated;
create index publication_social_media on private.publication_revisions using gin ((social->'media'));
alter function private.provision_post_storage() rename to provision_post_storage_v1;
create function private.provision_post_storage() returns void language plpgsql security invoker set search_path='' as $$
begin
 perform private.provision_post_storage_v1();
 insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('post-media','post-media',false,20971520,array['image/webp','video/mp4','video/webm']) on conflict(id) do nothing;
 drop policy if exists post_media_insert on storage.objects;
 drop policy if exists post_media_read on storage.objects;
 drop policy if exists post_media_remove_unused on storage.objects;
 create policy post_media_insert on storage.objects for insert to authenticated with check(bucket_id='post-media' and private.post_media_owner(name) and exists(select 1 from public.post_media_resources() data,jsonb_array_elements(data) r where r->>'id'='primary-media' and (r->>'writable')::boolean));
 create policy post_media_read on storage.objects for select to anon,authenticated using(bucket_id='post-media' and (private.post_media_owner(name) or private.post_media_public('primary-media',name)));
 create policy post_media_remove_unused on storage.objects for delete to authenticated using(bucket_id='post-media' and private.post_media_owner(name) and private.post_media_unused('primary-media',name));
end $$;
revoke all on function private.provision_post_storage() from public,anon,authenticated;
do $$begin if to_regclass('storage.objects') is not null then perform private.provision_post_storage();end if;end $$;
