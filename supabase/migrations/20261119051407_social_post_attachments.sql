-- Optional social details stay on the exact moderated revision. No source/epoch changes.
alter table private.publication_revisions add column social jsonb not null default '{}'::jsonb;
create function private.post_social(value jsonb,actor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare person jsonb; image jsonb; people jsonb:='[]'; images jsonb:='[]';
begin
 if value='{}'::jsonb then return value;end if;
 if jsonb_typeof(value)<>'object' or exists(select 1 from jsonb_object_keys(value) k where k<>all(array['people','location','feeling','images'])) then raise sqlstate 'PT422' using message='Invalid post details';end if;
 if jsonb_typeof(value->'people') is distinct from 'array' or jsonb_typeof(value->'images') is distinct from 'array' then raise sqlstate 'PT422' using message='Invalid post arrays';end if;
 if jsonb_array_length(value->'people')>10 or jsonb_array_length(value->'images')>4 then raise sqlstate 'PT422' using message='Post detail limit';end if;
 perform private.text_field(value,'location',0,120);
 perform private.text_field(value,'feeling',0,20);
 if (value->>'feeling')<>all(array['','happy','grateful','loved','excited','thoughtful','sad']) then raise sqlstate 'PT422' using message='Invalid feeling';end if;
 for person in select * from jsonb_array_elements(value->'people') loop
  if jsonb_typeof(person)<>'string' or private.text_units(person#>>'{}')>60 or private.trim_text(person#>>'{}')='' then raise sqlstate 'PT422' using message='Invalid person tag';end if;
  if not people @> jsonb_build_array(private.trim_text(person#>>'{}')) then people:=people||jsonb_build_array(private.trim_text(person#>>'{}'));end if;
 end loop;
 for image in select * from jsonb_array_elements(value->'images') loop
  if jsonb_typeof(image)<>'string' or (image#>>'{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$' or split_part(image#>>'{}','/',1)<>actor::text or images @> jsonb_build_array(image) then raise sqlstate 'PT422' using message='Invalid image path';end if;
  if not exists(select 1 from storage.objects where bucket_id='post-images' and name=image#>>'{}') then raise sqlstate 'PT422' using message='Upload image first';end if;
  images:=images||jsonb_build_array(image);
 end loop;
 return jsonb_build_object('people',people,'location',private.trim_text(value->>'location'),'feeling',value->>'feeling','images',images);
end $$;
revoke all on function private.post_social(jsonb,uuid) from public,anon,authenticated;
create or replace function private.publication_write(p_feature text,p_action text,p_id uuid default null,p_payload jsonb default null,p_expected_version integer default null,p_key uuid default null,p_revision integer default null,p_reason text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();p private.publications;r private.publication_revisions;saved private.feature_receipts;fingerprint jsonb;title text;body text;category text;ctype text;tags text[];sname text;sid uuid;pos integer;link jsonb;input_url text;tag text;new_revision integer;answer jsonb;social jsonb;
begin
 if actor is null then raise sqlstate 'PT401' using message='Authentication required';end if;
 if p_feature not in ('posts','media') or p_action not in ('create','save','submit','approve','reject','unpublish','delete') or p_key is null then raise sqlstate 'PT422' using message='Invalid mutation';end if;
 perform private.require_feature_writes(p_feature);
 fingerprint:=jsonb_build_object('feature',p_feature,'action',p_action,'id',p_id,'payload',p_payload,'version',p_expected_version,'revision',p_revision,'reason',p_reason);
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_key::text,0));
 select * into saved from private.feature_receipts where actor_id=actor and key=p_key;
 if found then
  if saved.fingerprint<>fingerprint then raise sqlstate 'PT409' using message='Idempotency key reused';end if;
  if p_action='delete' then return jsonb_build_object('id',saved.object_id,'deleted',true);end if;
  return private.publication_json(saved.object_id,true);
 end if;
 if p_action<>'create' then
  select * into p from private.publications where id=p_id and feature=p_feature and deleted_at is null for update;
  if not found then raise sqlstate 'PT404' using message='Not found';end if;
  if p_action in ('approve','reject','unpublish') then
   if not private.is_owner() then raise sqlstate 'PT403' using message='Owner required';end if;
   if p_reason is null or private.text_units(private.trim_text(p_reason)) not between 1 and 500 then raise sqlstate 'PT422' using message='Moderation reason required';end if;
  elsif p.author_id is distinct from actor then raise sqlstate 'PT403' using message='Author required';end if;
  if p_expected_version is null or p_expected_version<>p.version then raise sqlstate 'PT409' using message='Version conflict';end if;
 end if;
 if p_action in ('create','save') then
  if jsonb_typeof(p_payload) is distinct from 'object' then raise sqlstate 'PT422' using message='Payload required';end if;
  if exists(select 1 from jsonb_object_keys(p_payload) k where k<>all(case when p_feature='posts' then array['title','body','kind','category','tags','series','order','social'] else array['title','description','category','tags','url'] end)) then raise sqlstate 'PT422' using message='Unknown payload field';end if;
  title:=private.text_field(p_payload,'title',3,120);tags:=private.tag_list(coalesce(p_payload->'tags','[]'));
  if p_feature='posts' then
   if p_payload ? 'social' and not private.is_owner() then raise sqlstate 'PT403' using message='Owner required for social posts';end if;
   social:=private.post_social(coalesce(p_payload->'social','{}'),actor);
   body:=private.text_field(p_payload,'body',1,12000);category:=private.text_field(p_payload,'category',1,60);ctype:=private.text_field(p_payload,'kind',1,20);
   if ctype not in ('article','note','poem') or cardinality(tags)=0 then raise sqlstate 'PT422' using message='Invalid post';end if;
   sname:=private.text_field(p_payload,'series',0,100);
   if jsonb_typeof(p_payload->'order') is distinct from 'number' or (p_payload->>'order')!~'^[0-9]+$' or (p_payload->>'order')::numeric not between 1 and 100000 then raise sqlstate 'PT422' using message='Invalid series order';end if;
   if sname<>'' then
    pos:=(p_payload->>'order')::integer;
    insert into private.series(author_id,name) values(actor,sname) on conflict(author_id,name) do update set name=excluded.name returning id into sid;
   end if;
  else
   body:=private.text_field(p_payload,'description',0,1500);category:=private.text_field(p_payload,'category',1,20);ctype:=category;
   if category not in ('music','video') then raise sqlstate 'PT422' using message='Invalid media category';end if;
   input_url:=private.text_field(p_payload,'url',1,2048);link:=private.media_url(input_url);
  end if;
 end if;
 perform private.feature_guard(p_feature);
 if p_action='create' then
  p.id:=gen_random_uuid();p.entity_id:=p.id;
  insert into public.content_entities(id,collection,legacy_key,canonical_path) values(p.id,'page',p_feature||':'||p.id::text,'/hiens-nha/community/'||case when p_feature='posts' then 'post' else 'media' end||'/?id='||p.id::text);
  insert into private.publications(id,entity_id,feature,author_id) values(p.id,p.id,p_feature,actor) returning * into p;
  new_revision:=1;
 elsif p_action='save' then
  new_revision:=p.working_revision+1;
  update private.publications set working_revision=new_revision,version=version+1,updated_at=now() where id=p.id returning * into p;
 end if;
 if p_action in ('create','save') then
  insert into private.categories values(p_feature,category) on conflict do nothing;
  insert into private.publication_revisions(publication_id,feature,revision,actor_id,title,body,content_type,category,tags,series_id,position,source_url,canonical_url,provider,sort_order,social)
   values(p.id,p_feature,new_revision,actor,title,body,ctype,category,tags,sid,pos,input_url,link->>'url',link->>'platform',coalesce((p_payload->>'order')::integer,1),coalesce(social,'{}'));
  foreach tag in array tags loop insert into private.tags values(tag) on conflict do nothing;insert into private.revision_tags values(p.id,new_revision,tag);end loop;
  if sid is not null then
   insert into private.series_slots values(sid,pos,p.id) on conflict do nothing;
   if not exists(select 1 from private.series_slots where series_id=sid and position=pos and publication_id=p.id) then raise sqlstate 'PT409' using message='Series position occupied';end if;
  end if;
 elsif p_action='submit' then
  select * into r from private.publication_revisions where publication_id=p.id and revision=p.working_revision;
  if r.moderation not in ('draft','rejected') then raise sqlstate 'PT409' using message='Revision already submitted';end if;
  update private.publication_revisions set moderation='pending' where publication_id=p.id and revision=p.working_revision;
  update private.publications set version=version+1,updated_at=now() where id=p.id returning * into p;
 elsif p_action in ('approve','reject') then
  if p_revision is null or p_revision<>p.working_revision then raise sqlstate 'PT409' using message='Review exact current revision';end if;
  select * into r from private.publication_revisions where publication_id=p.id and revision=p_revision;
  if r.moderation<>'pending' then raise sqlstate 'PT409' using message='Revision not pending';end if;
  update private.publication_revisions set moderation=case when p_action='approve' then 'approved' else 'rejected' end where publication_id=p.id and revision=p_revision;
  update private.publications set published_revision=case when p_action='approve' then p_revision else published_revision end,version=version+1,updated_at=now() where id=p.id returning * into p;
 elsif p_action='unpublish' then
  update private.publications set published_revision=null,version=version+1,updated_at=now() where id=p.id returning * into p;
 else
  update private.publications set deleted_at=now(),published_revision=null,version=version+1,updated_at=now() where id=p.id returning * into p;
 end if;
 delete from private.series_slots s where s.publication_id=p.id and (p.deleted_at is not null or not exists(select 1 from private.publication_revisions rev where rev.publication_id=p.id and rev.revision in (p.working_revision,p.published_revision) and rev.series_id=s.series_id and rev.position=s.position));
 insert into private.publication_events(publication_id,actor_id,action,version,revision,reason) values(p.id,actor,p_action,p.version,p.working_revision,p_reason);
 insert into private.feature_receipts values(actor,p_key,p_feature,fingerprint,p.id);
 if p_action='delete' then return jsonb_build_object('id',p.id,'deleted',true);end if;
 return private.publication_json(p.id,true);
end $$;

create or replace function private.publication_json(p_id uuid,p_working boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p private.publications;r private.publication_revisions;can_edit boolean;sname text;
begin
 select * into p from private.publications where id=p_id and deleted_at is null;
 if not found then raise sqlstate 'PT404' using message='Publication not found';end if;
 can_edit:=p.author_id=auth.uid() or private.is_owner();
 if p_working and not coalesce(can_edit,false) then raise sqlstate 'PT403' using message='Author or owner required';end if;
 select * into r from private.publication_revisions where publication_id=p.id and revision=(case when p_working then p.working_revision else p.published_revision end);
 if not found then raise sqlstate 'PT404' using message='Publication not public';end if;
 select name into sname from private.series where id=r.series_id;
 return jsonb_build_object('id',p.id,'entity_id',p.entity_id,'author_id',p.author_id,'feature',p.feature,'version',p.version,'revision',r.revision,'published_revision',p.published_revision,'status',case when p_working then r.moderation else 'approved' end,'created_at',p.created_at,'updated_at',p.updated_at,
  'payload',case when p.feature='posts' then jsonb_build_object('title',r.title,'body',r.body,'kind',r.content_type,'category',r.category,'tags',r.tags,'series',coalesce(sname,''),'seriesId',r.series_id,'order',r.sort_order)||case when r.social='{}' then '{}'::jsonb else jsonb_build_object('social',r.social) end
  else jsonb_build_object('title',r.title,'description',r.body,'category',r.category,'tags',r.tags,'sourceUrl',r.source_url,'url',r.canonical_url,'platform',r.provider) end);
end $$;

create or replace function private.publication_history(p_id uuid,p_before integer default null,p_limit integer default 20) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p private.publications;output jsonb;
begin
 select * into p from private.publications where id=p_id;
 if not found then raise sqlstate 'PT404' using message='Not found';end if;
 if not (p.author_id is not distinct from auth.uid() and auth.uid() is not null or private.is_owner()) then raise sqlstate 'PT403' using message='Author or owner required';end if;
 select coalesce(jsonb_agg(jsonb_build_object('revision',revision,'title',title,'body',body,'category',category,'tags',tags,'social',social,'source_url',source_url,'canonical_url',canonical_url,'series_id',series_id,'position',position,'status',moderation,'actor_id',actor_id,'created_at',created_at) order by revision desc),'[]') into output from (select * from private.publication_revisions where publication_id=p_id and (p_before is null or revision<p_before) order by revision desc limit least(greatest(p_limit,1),51)) limited;
 return output;
end $$;

-- Private media: image bytes are fetched with the caller's session, never a public URL.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('post-images','post-images',false,2097152,array['image/webp']);
create function private.post_image_owner(path text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.is_owner() and path ~ ('^'||auth.uid()::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$');
$$;
create function private.post_image_public(path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.publications p join private.publication_revisions r on r.publication_id=p.id and r.revision=p.published_revision where p.feature='posts' and p.deleted_at is null and r.social->'images' @> jsonb_build_array(path));
$$;
create function private.post_image_unused(path text) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.publication_revisions r where r.social->'images' @> jsonb_build_array(path));
$$;
revoke all on function private.post_image_owner(text),private.post_image_public(text),private.post_image_unused(text) from public,anon,authenticated;
grant execute on function private.post_image_owner(text),private.post_image_public(text) to anon,authenticated;
grant execute on function private.post_image_unused(text) to authenticated;
create policy post_images_insert on storage.objects for insert to authenticated with check(bucket_id='post-images' and private.post_image_owner(name));
create policy post_images_read on storage.objects for select to anon,authenticated using(bucket_id='post-images' and (private.post_image_owner(name) or private.post_image_public(name)));
create policy post_images_remove_unused on storage.objects for delete to authenticated using(bucket_id='post-images' and private.post_image_owner(name) and private.post_image_unused(name));
create index publication_social_images on private.publication_revisions using gin ((social->'images'));
