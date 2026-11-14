-- Private typed storage; all access through caller-aware, narrowly scoped RPCs.
create table private.feature_controls(feature text primary key check(feature in ('posts','media','requests')),source text not null default 'git' check(source in ('git','api')),epoch integer not null default 0 check(epoch>=0),writes_enabled boolean not null default false);
insert into private.feature_controls(feature) values('posts'),('media'),('requests');
create table private.feature_receipts(actor_id uuid not null references public.profiles(id),key uuid not null,feature text not null references private.feature_controls(feature),fingerprint jsonb not null,object_id uuid not null,primary key(actor_id,key));
create table private.feature_windows(actor_id uuid not null references public.profiles(id),feature text not null references private.feature_controls(feature),window_start timestamptz not null,count integer not null,primary key(actor_id,feature,window_start));
create table private.categories(feature text not null, label text not null,primary key(feature,label));
create table private.tags(label text primary key);
create table private.series(id uuid primary key default gen_random_uuid(),author_id uuid not null references public.profiles(id),name text not null check(length(name) between 1 and 100),unique(author_id,name));
create table private.publications(
 id uuid primary key default gen_random_uuid(),entity_id uuid not null unique references public.content_entities(id),feature text not null check(feature in ('posts','media')),
 author_id uuid references public.profiles(id),version integer not null default 1 check(version>0),working_revision integer not null default 1,published_revision integer,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz,unique(id,feature)
);
create table private.publication_revisions(
 publication_id uuid not null,feature text not null,revision integer not null check(revision>0),actor_id uuid references public.profiles(id),
 title text not null,body text not null,content_type text not null,category text not null,tags text[] not null,
 series_id uuid references private.series(id),position integer check(position between 1 and 100000),source_url text,canonical_url text,provider text,
 moderation text not null default 'draft' check(moderation in ('draft','pending','approved','rejected')),
 created_at timestamptz not null default now(),primary key(publication_id,revision),foreign key(publication_id,feature) references private.publications(id,feature),
 foreign key(feature,category) references private.categories(feature,label),check((series_id is null)=(position is null)),
 check((feature='posts' and content_type in ('article','note','poem') and source_url is null and canonical_url is null and provider is null) or
 (feature='media' and content_type in ('music','video') and source_url is not null and canonical_url is not null and provider in ('YouTube','Facebook') and series_id is null))
);
alter table private.publications add foreign key(id,working_revision) references private.publication_revisions(publication_id,revision) deferrable initially deferred;
alter table private.publications add foreign key(id,published_revision) references private.publication_revisions(publication_id,revision) deferrable initially deferred;
create table private.revision_tags(publication_id uuid not null,revision integer not null,label text not null references private.tags(label),primary key(publication_id,revision,label),foreign key(publication_id,revision) references private.publication_revisions(publication_id,revision));
create table private.series_slots(series_id uuid not null references private.series(id),position integer not null,publication_id uuid not null references private.publications(id),primary key(series_id,position));
create table private.publication_events(id uuid primary key default gen_random_uuid(),publication_id uuid not null references private.publications(id),actor_id uuid references public.profiles(id),action text not null,version integer not null,revision integer,reason text,created_at timestamptz not null default now());
create index publications_cursor on private.publications(feature,created_at desc,id desc);
create index publications_author on private.publications(author_id,feature,created_at desc,id desc);
create index revision_moderation on private.publication_revisions(moderation,publication_id,revision);

-- JS-compatible UTF-16 lengths for the reused legacy validators.
create function private.text_units(value text) returns integer language sql immutable set search_path='' as $$
 select coalesce(sum(case when ascii(c)>65535 then 2 else 1 end),0)::integer from unnest(string_to_array(value,null)) c;
$$;
create function private.text_field(data jsonb,field text,min_units integer,max_units integer) returns text language plpgsql immutable set search_path='' as $$
declare value text;
begin
 if jsonb_typeof(data->field) is distinct from 'string' then raise sqlstate 'PT422' using message='Text field required';end if;
 value:=data->>field;
 if private.text_units(btrim(value,E' \t\r\n'))<min_units or private.text_units(value)>max_units then raise sqlstate 'PT422' using message='Text field length invalid';end if;
 return btrim(value,E' \t\r\n');
end $$;
create function private.tag_list(value jsonb) returns text[] language plpgsql immutable set search_path='' as $$
declare tags text[];v jsonb;
begin
 if jsonb_typeof(value) is distinct from 'array' or jsonb_array_length(value)>12 then raise sqlstate 'PT422' using message='Invalid tags';end if;
 tags:=array[]::text[];
 for v in select * from jsonb_array_elements(value) loop
  if jsonb_typeof(v)<>'string' or btrim(v#>>'{}',E' \t\r\n')='' or private.text_units(v#>>'{}')>40 then raise sqlstate 'PT422' using message='Invalid tag';end if;
  if not (btrim(v#>>'{}',E' \t\r\n')=any(tags)) then tags:=array_append(tags,btrim(v#>>'{}',E' \t\r\n'));end if;
 end loop;return tags;
end $$;
create function private.query_value(query text,wanted text) returns text language plpgsql immutable set search_path='' as $$
declare pair text;key text;value text;part text;decoded text; i integer;n integer;
begin
 foreach pair in array string_to_array(coalesce(query,''),'&') loop
  key:=split_part(pair,'=',1);value:=substr(pair,length(key)+2);
  for n in 1..2 loop
   part:=replace(case when n=1 then key else value end,'+',' ');decoded:='';i:=1;
   while i<=length(part) loop
    if substr(part,i,1)='%' and substr(part,i+1,2)~'^[0-9a-fA-F]{2}$' then
     if ('x'||substr(part,i+1,2))::bit(8)::integer=0 then return null;end if;
     decoded:=decoded||chr(('x'||substr(part,i+1,2))::bit(8)::integer);i:=i+3;
    else decoded:=decoded||substr(part,i,1);i:=i+1;end if;
   end loop;
   if n=1 then key:=decoded;else value:=decoded;end if;
  end loop;
  if key=wanted then return value;end if;
 end loop;return null;
end $$;
create function private.media_url(source text) returns jsonb language plpgsql immutable set search_path='' as $$
declare m text[];host text;path text;query text;video text;canonical text;platform text;
begin
 m:=regexp_match(btrim(source),'^https://([^/?#]+)([^?#]*)(?:\?([^#]*))?(?:#.*)?$','i');
 if m is null then raise sqlstate 'PT422' using message='HTTPS media URL required';end if;
 host:=lower(regexp_replace(m[1],':443$',''));path:=coalesce(nullif(m[2],''),'/');query:=m[3];
 if host in ('youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be') then
  if host='youtu.be' then video:=substr(path,2);
  elsif path='/watch' then video:=private.query_value(query,'v');
  else video:=(regexp_match(path,'^/(?:shorts|embed|live)/([^/]+)/?$'))[1];end if;
  if video is null or video!~'^[A-Za-z0-9_-]{11}$' then raise sqlstate 'PT422' using message='Invalid YouTube URL';end if;
  canonical:='https://www.youtube.com/watch?v='||video;platform:='YouTube';
 elsif host='fb.watch' and path~'^/[A-Za-z0-9_-]+/?$' then canonical:='https://fb.watch'||path;platform:='Facebook';
 elsif host in ('facebook.com','www.facebook.com','m.facebook.com','mbasic.facebook.com') then
  video:=private.query_value(query,'v');
  if path in ('/watch','/watch/','/video.php') and video~'^[0-9]+$' then canonical:='https://www.facebook.com/watch/?v='||video;
  else
   if regexp_replace(path,'/?$','/')='/share/v/1J6iFA7d3k/' then path:='/sugia279/videos/10157418134484634/';end if;
   if path!~'^/(?:[A-Za-z0-9_.-]+/videos/[0-9]+|reel/[0-9]+|share/[vr]/[A-Za-z0-9_]+)/?$' then raise sqlstate 'PT422' using message='Invalid Facebook URL';end if;
   canonical:='https://www.facebook.com'||path;
  end if;platform:='Facebook';
 else raise sqlstate 'PT422' using message='Unsupported media provider';end if;
 return jsonb_build_object('url',canonical,'platform',platform);
end $$;
create function private.feature_guard(feature_name text) returns void language plpgsql security definer set search_path='' as $$
declare count_now integer;
begin
 if auth.uid() is null then raise sqlstate 'PT401' using message='Authentication required';end if;
 if not exists(select 1 from private.feature_controls where feature=feature_name and source='api' and epoch>0 and writes_enabled) then raise sqlstate 'PT503' using message='Feature writes disabled';end if;
 insert into private.feature_windows values(auth.uid(),feature_name,date_trunc('minute',statement_timestamp()),1)
 on conflict(actor_id,feature,window_start) do update set count=private.feature_windows.count+1 returning count into count_now;
 if count_now>(case when private.is_owner() then 120 else 30 end) then raise sqlstate 'PT429' using message='Mutation quota exceeded';end if;
end $$;
create function private.feature_state(feature_name text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('source',source,'epoch',epoch,'writes_enabled',writes_enabled) from private.feature_controls where feature=feature_name;
$$;
create function private.publication_json(p_id uuid,p_working boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
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
  'payload',case when p.feature='posts' then jsonb_build_object('title',r.title,'body',r.body,'kind',r.content_type,'category',r.category,'tags',r.tags,'series',coalesce(sname,''),'seriesId',r.series_id,'order',coalesce(r.position,1))
  else jsonb_build_object('title',r.title,'description',r.body,'category',r.category,'tags',r.tags,'sourceUrl',r.source_url,'url',r.canonical_url,'platform',r.provider) end);
end $$;
create function private.publication_read(p_feature text,p_view text default 'public',p_id uuid default null,p_limit integer default 20,p_after_time timestamptz default null,p_after_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare output jsonb:='[]';row private.publications;
begin
 if p_feature not in ('posts','media') or p_view not in ('public','mine','pending','working','all') or p_limit not between 1 and 51 then raise sqlstate 'PT422' using message='Invalid publication query';end if;
 if p_view in ('mine','working') and auth.uid() is null then raise sqlstate 'PT401' using message='Authentication required';end if;
 if p_view in ('pending','all') and not private.is_owner() then raise sqlstate 'PT403' using message='Owner required';end if;
 if p_id is not null then
  if not exists(select 1 from private.publications where id=p_id and feature=p_feature) then raise sqlstate 'PT404' using message='Not found';end if;
  return private.publication_json(p_id,p_view<>'public');
 end if;
 for row in select p.* from private.publications p join private.publication_revisions r on r.publication_id=p.id and r.revision=p.working_revision
 where p.feature=p_feature and p.deleted_at is null and (p_after_time is null or (p.created_at,p.id)<(p_after_time,p_after_id)) and
 ((p_view='public' and p.published_revision is not null) or (p_view in ('mine','working') and p.author_id=auth.uid()) or (p_view='pending' and r.moderation='pending') or p_view='all')
 order by p.created_at desc,p.id desc limit p_limit loop output:=output||jsonb_build_array(private.publication_json(row.id,p_view<>'public'));end loop;
 return output;
end $$;
create function private.publication_history(p_id uuid,p_before integer default null,p_limit integer default 20) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p private.publications;output jsonb;
begin
 select * into p from private.publications where id=p_id;
 if not found then raise sqlstate 'PT404' using message='Not found';end if;
 if not (p.author_id is not distinct from auth.uid() and auth.uid() is not null or private.is_owner()) then raise sqlstate 'PT403' using message='Author or owner required';end if;
 select coalesce(jsonb_agg(jsonb_build_object('revision',revision,'title',title,'body',body,'category',category,'tags',tags,'source_url',source_url,'canonical_url',canonical_url,'series_id',series_id,'position',position,'status',moderation,'actor_id',actor_id,'created_at',created_at) order by revision desc),'[]') into output from (select * from private.publication_revisions where publication_id=p_id and (p_before is null or revision<p_before) order by revision desc limit least(greatest(p_limit,1),51)) limited;
 return output;
end $$;
create function private.publication_write(p_feature text,p_action text,p_id uuid default null,p_payload jsonb default null,p_expected_version integer default null,p_key uuid default null,p_revision integer default null,p_reason text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();p private.publications;r private.publication_revisions;saved private.feature_receipts;fingerprint jsonb;title text;body text;category text;ctype text;tags text[];sname text;sid uuid;pos integer;link jsonb;input_url text;tag text;new_revision integer;answer jsonb;
begin
 if actor is null then raise sqlstate 'PT401' using message='Authentication required';end if;
 if p_feature not in ('posts','media') or p_action not in ('create','save','submit','approve','reject','unpublish','delete') or p_key is null then raise sqlstate 'PT422' using message='Invalid mutation';end if;
 if not exists(select 1 from private.feature_controls where feature=p_feature and source='api' and epoch>0 and writes_enabled) then raise sqlstate 'PT503' using message='Feature writes disabled';end if;
 fingerprint:=jsonb_build_object('feature',p_feature,'action',p_action,'id',p_id,'payload',p_payload,'version',p_expected_version,'revision',p_revision,'reason',p_reason);
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_key::text,0));
 select * into saved from private.feature_receipts where actor_id=actor and key=p_key;
 if found then
  if saved.fingerprint<>fingerprint then raise sqlstate 'PT409' using message='Idempotency key reused';end if;
  if p_action='delete' then return jsonb_build_object('id',saved.object_id,'deleted',true);end if;
  if p_action='delete' then return jsonb_build_object('id',saved.object_id,'deleted',true);end if;return private.publication_json(saved.object_id,true);
 end if;
 if p_action<>'create' then
  select * into p from private.publications where id=p_id and feature=p_feature and deleted_at is null for update;
  if not found then raise sqlstate 'PT404' using message='Not found';end if;
  if p_action in ('approve','reject','unpublish') then
   if not private.is_owner() then raise sqlstate 'PT403' using message='Owner required';end if;
   if p_reason is null or length(btrim(p_reason)) not between 1 and 500 then raise sqlstate 'PT422' using message='Moderation reason required';end if;
  elsif p.author_id is distinct from actor then raise sqlstate 'PT403' using message='Author required';end if;
  if p_expected_version is null or p_expected_version<>p.version then raise sqlstate 'PT409' using message='Version conflict';end if;
 end if;
 if p_action in ('create','save') then
  if jsonb_typeof(p_payload) is distinct from 'object' then raise sqlstate 'PT422' using message='Payload required';end if;
  if exists(select 1 from jsonb_object_keys(p_payload) k where k<>all(case when p_feature='posts' then array['title','body','kind','category','tags','series','order'] else array['title','description','category','tags','url'] end)) then raise sqlstate 'PT422' using message='Unknown payload field';end if;
  title:=private.text_field(p_payload,'title',3,120);tags:=private.tag_list(coalesce(p_payload->'tags','[]'));
  if p_feature='posts' then
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
  insert into private.publication_revisions(publication_id,feature,revision,actor_id,title,body,content_type,category,tags,series_id,position,source_url,canonical_url,provider)
   values(p.id,p_feature,new_revision,actor,title,body,ctype,category,tags,sid,pos,input_url,link->>'url',link->>'platform');
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

-- Every new table is deny-first, including histories/quotas/receipts.
do $$declare name text;begin
 foreach name in array array['feature_controls','feature_receipts','feature_windows','categories','tags','series','publications','publication_revisions','revision_tags','series_slots','publication_events'] loop
 execute format('alter table private.%I enable row level security',name);
 execute format('revoke all on private.%I from public,anon,authenticated',name);
 end loop;
end $$;
revoke all on all functions in schema private from public;
grant execute on function private.feature_state(text),private.publication_read(text,text,uuid,integer,timestamptz,uuid) to anon,authenticated;
grant execute on function private.publication_write(text,text,uuid,jsonb,integer,uuid,integer,text),private.publication_history(uuid,integer,integer) to authenticated;
create function public.feature_state(p_feature text) returns jsonb language sql security invoker set search_path='' as $$select private.feature_state(p_feature);$$;
create function public.publication_read(p_feature text,p_view text default 'public',p_id uuid default null,p_limit integer default 20,p_after_time timestamptz default null,p_after_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.publication_read(p_feature,p_view,p_id,p_limit,p_after_time,p_after_id);$$;
create function public.publication_write(p_feature text,p_action text,p_id uuid default null,p_payload jsonb default null,p_expected_version integer default null,p_key uuid default null,p_revision integer default null,p_reason text default null) returns jsonb language sql security invoker set search_path='' as $$select private.publication_write(p_feature,p_action,p_id,p_payload,p_expected_version,p_key,p_revision,p_reason);$$;
create function public.publication_history(p_id uuid,p_before integer default null,p_limit integer default 20) returns jsonb language sql security invoker set search_path='' as $$select private.publication_history(p_id,p_before,p_limit);$$;
revoke all on function public.feature_state(text),public.publication_read(text,text,uuid,integer,timestamptz,uuid),public.publication_write(text,text,uuid,jsonb,integer,uuid,integer,text),public.publication_history(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.feature_state(text),public.publication_read(text,text,uuid,integer,timestamptz,uuid) to anon,authenticated;
grant execute on function public.publication_write(text,text,uuid,jsonb,integer,uuid,integer,text),public.publication_history(uuid,integer,integer) to authenticated;
