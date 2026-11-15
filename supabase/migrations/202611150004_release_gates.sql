-- Release gates serialize maintenance with admitted writes; no new client permissions.
create function private.require_feature_writes(feature_name text) returns void language plpgsql security definer set search_path='' as $$
declare settings private.feature_controls;
begin
 select * into settings from private.feature_controls where feature=feature_name for share;
 if not found or settings.source<>'api' or settings.epoch<1 or not settings.writes_enabled then raise sqlstate 'PT503' using message='Feature writes disabled';end if;
end $$;
create function private.require_comment_writes() returns void language plpgsql security definer set search_path='' as $$
declare settings private.backend_settings;
begin
 select * into settings from private.backend_settings where singleton for share;
 if not found or settings.comments_source<>'api' or settings.comments_epoch<1 or not settings.comments_writes_enabled then raise sqlstate 'PT503' using message='Comment writes disabled';end if;
end $$;
revoke all on function private.require_feature_writes(text),private.require_comment_writes() from public,anon,authenticated;
-- Shared historical namespace has no Auth owner and cannot be claimed by a matching login.
alter table private.series alter column author_id drop not null;
alter table private.series add column legacy_namespace text;
alter table private.series add check ((author_id is not null and legacy_namespace is null) or (author_id is null and legacy_namespace is not null));
create unique index legacy_series_name on private.series(legacy_namespace,name) where author_id is null;
create table private.control_events(id uuid primary key default gen_random_uuid(),feature text not null,previous jsonb not null,next jsonb not null,reason text not null,created_at timestamptz not null default now());
alter table private.control_events enable row level security;
revoke all on private.control_events from public,anon,authenticated;
create table private.legacy_tombstones(feature text not null,legacy_key text not null,object_id uuid not null,entity_id uuid not null references public.content_entities(id),primary key(feature,legacy_key));
alter table private.legacy_tombstones enable row level security;
revoke all on private.legacy_tombstones from public,anon,authenticated;
alter table private.publication_revisions add column sort_order integer not null default 1 check(sort_order between 1 and 100000);
update private.publication_revisions set sort_order=coalesce(position,1);
create or replace function private.feature_guard(feature_name text) returns void language plpgsql security definer set search_path='' as $$
declare count_now integer;
begin
 if auth.uid() is null then raise sqlstate 'PT401' using message='Authentication required';end if;
 perform private.require_feature_writes(feature_name);
 insert into private.feature_windows values(auth.uid(),feature_name,date_trunc('minute',statement_timestamp()),1)
 on conflict(actor_id,feature,window_start) do update set count=private.feature_windows.count+1 returning count into count_now;
 if count_now>(case when private.is_owner() then 120 else 30 end) then raise sqlstate 'PT429' using message='Mutation quota exceeded';end if;
end $$;

create or replace function private.publication_write(p_feature text,p_action text,p_id uuid default null,p_payload jsonb default null,p_expected_version integer default null,p_key uuid default null,p_revision integer default null,p_reason text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();p private.publications;r private.publication_revisions;saved private.feature_receipts;fingerprint jsonb;title text;body text;category text;ctype text;tags text[];sname text;sid uuid;pos integer;link jsonb;input_url text;tag text;new_revision integer;answer jsonb;
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
  insert into private.publication_revisions(publication_id,feature,revision,actor_id,title,body,content_type,category,tags,series_id,position,source_url,canonical_url,provider,sort_order)
   values(p.id,p_feature,new_revision,actor,title,body,ctype,category,tags,sid,pos,input_url,link->>'url',link->>'platform',coalesce((p_payload->>'order')::integer,1));
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

create or replace function private.request_write(p_action text,p_id uuid default null,p_payload jsonb default null,p_expected_version integer default null,p_key uuid default null,p_scope_revision integer default null,p_status text default null,p_message text default null,p_result text default null,p_target uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();r private.help_requests;saved private.feature_receipts;fingerprint jsonb;title text;description text;expected text;category text;priority text;tags text[];normalized jsonb;changed boolean;next_scope integer;allowed text[];
begin
 if actor is null then raise sqlstate 'PT401' using message='Authentication required';end if;
 if p_action not in ('create','scope','moderate','transition','correction') or p_key is null then raise sqlstate 'PT422' using message='Invalid mutation';end if;
 perform private.require_feature_writes('requests');
 fingerprint:=jsonb_build_object('action',p_action,'id',p_id,'payload',p_payload,'version',p_expected_version,'scope',p_scope_revision,'status',p_status,'message',p_message,'result',p_result,'target',p_target);
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_key::text,0));
 select * into saved from private.feature_receipts where actor_id=actor and key=p_key;
 if found then if saved.fingerprint<>fingerprint then raise sqlstate 'PT409' using message='Idempotency key reused';end if;return private.request_json(saved.object_id);end if;
 if p_action<>'create' then
  select * into r from private.help_requests where id=p_id and deleted_at is null for update;
  if not found then raise sqlstate 'PT404' using message='Request not found';end if;
  if p_action in ('moderate','transition','correction') then
   if not private.is_owner() then raise sqlstate 'PT403' using message='Owner required';end if;
  elsif r.author_id is distinct from actor then raise sqlstate 'PT403' using message='Author required';end if;
  if p_expected_version is null or p_expected_version<>r.version then raise sqlstate 'PT409' using message='Version conflict';end if;
  if p_scope_revision is null or p_scope_revision<>r.scope_revision then raise sqlstate 'PT409' using message='Scope conflict';end if;
 end if;
 if p_action in ('create','scope') then
  if jsonb_typeof(p_payload) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_payload) k where k<>all(array['title','description','expectedResult','category','priority','tags'])) then raise sqlstate 'PT422' using message='Invalid request payload';end if;
  title:=private.text_field(p_payload,'title',3,120);description:=private.text_field(p_payload,'description',10,4000);expected:=private.text_field(p_payload,'expectedResult',3,1000);
  category:=private.text_field(p_payload,'category',1,30);priority:=private.text_field(p_payload,'priority',1,20);tags:=private.tag_list(coalesce(p_payload->'tags','[]'));
  if category not in ('technology','creative','information','other') or priority not in ('low','normal','high') then raise sqlstate 'PT422' using message='Invalid category/priority';end if;
  normalized:=jsonb_build_object('title',title,'description',description,'expectedResult',expected,'category',category,'priority',priority,'tags',tags);
 else
  if p_message is null or private.text_units(private.trim_text(p_message))<1 or private.text_units(p_message)>2000 or (p_result is not null and private.text_units(p_result)>4000) then raise sqlstate 'PT422' using message='Message/result invalid';end if;
  if p_action='moderate' and p_status not in ('approved','rejected','hidden') then raise sqlstate 'PT422' using message='Invalid moderation';end if;
  if p_action='correction' and (p_target is null or not exists(select 1 from private.request_events where id=p_target and request_id=p_id)) then raise sqlstate 'PT422' using message='Correction target required';end if;
  if p_action='transition' then
   allowed:=case r.status when 'new' then array['accepted','declined','cancelled'] when 'accepted' then array['in-progress','waiting','completed','cancelled'] when 'in-progress' then array['waiting','completed','cancelled'] when 'waiting' then array['in-progress','completed','cancelled'] when 'completed' then array['in-progress'] when 'declined' then array['accepted'] when 'cancelled' then array['accepted'] end;
   if p_status is null or (p_status<>r.status and not(p_status=any(allowed))) then raise sqlstate 'PT422' using message='Invalid transition';end if;
   if p_status='completed' and (r.accepted_scope_revision is distinct from r.scope_revision or private.text_units(private.trim_text(coalesce(p_result,'')))=0) then raise sqlstate 'PT422' using message='Accepted scope and completion result required';end if;
  end if;
 end if;
 perform private.feature_guard('requests');
 if p_action='create' then
  r.id:=gen_random_uuid();
  insert into public.content_entities(id,collection,legacy_key,canonical_path) values(r.id,'page','requests:'||r.id::text,'/hiens-nha/requests/detail/?id='||r.id::text);
  insert into private.help_requests(id,entity_id,author_id) values(r.id,r.id,actor) returning * into r;
  insert into private.request_scope_revisions values(r.id,1,title,description,expected,category,priority,tags,actor,now());
 elsif p_action='scope' then
  changed:=normalized<>private.request_payload(r.id,r.scope_revision);next_scope:=r.scope_revision+case when changed then 1 else 0 end;
  if changed then insert into private.request_scope_revisions values(r.id,next_scope,title,description,expected,category,priority,tags,actor,now());end if;
  update private.help_requests set version=version+1,scope_revision=next_scope,status=case when changed then 'new' else status end,
   accepted_scope_revision=case when changed then null else accepted_scope_revision end,result=case when changed then '' else result end,updated_at=now() where id=r.id returning * into r;
 elsif p_action='moderate' then
  if p_status is null then raise sqlstate 'PT422' using message='Moderation required';end if;
  update private.help_requests set moderation=p_status,version=version+1,updated_at=now() where id=r.id returning * into r;
 elsif p_action='transition' then
  update private.help_requests set status=p_status,version=version+1,updated_at=now(),
    accepted_scope_revision=case when p_status='accepted' then scope_revision when p_status in ('new','declined','cancelled') then null else accepted_scope_revision end,
    result=case when p_status='completed' then private.trim_text(p_result) else '' end where id=r.id returning * into r;
 else
  update private.help_requests set version=version+1,updated_at=now() where id=r.id returning * into r;
 end if;
 insert into private.request_events(request_id,version,scope_revision,actor_id,action,status_after,message,result,corrects)
 values(r.id,r.version,r.scope_revision,actor,p_action,r.status,case when p_action='create' then 'Request submitted' when p_action='scope' then case when changed then 'Scope changed; acceptance reset' else 'Scope saved without changes' end else private.trim_text(p_message) end,r.result,p_target);
 insert into private.feature_receipts values(actor,p_key,'requests',fingerprint,r.id);
 return private.request_json(r.id);
end $$;

create or replace function private.write_comment(
  p_action text, p_id uuid default null, p_entity_id uuid default null, p_parent_id uuid default null,
  p_body text default null, p_status text default null, p_expected_version integer default null,
  p_key uuid default null, p_reason text default null
) returns public.comments language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  owner_actor boolean := private.is_owner();
  item public.comments;
  parent public.comments;
  saved private.mutation_keys;
  payload jsonb;
  window_count integer;
begin
  if actor is null then raise sqlstate 'PT401' using message = 'Authentication required'; end if;
  perform private.require_comment_writes();
  if p_action not in ('create', 'edit', 'delete', 'moderate') or p_action is null then
    raise sqlstate 'PT422' using message = 'Invalid action';
  end if;
  if p_action in ('create', 'edit') and (p_body is null or length(btrim(p_body, E' \t\r\n\v\f')) not between 1 and 4000) then
    raise sqlstate 'PT422' using message = 'Body must contain 1–4000 characters';
  end if;
  if p_action = 'create' then
    if p_key is null then raise sqlstate 'PT422' using message = 'Idempotency key required'; end if;
    payload := jsonb_build_object('entity', p_entity_id, 'parent', p_parent_id, 'body', p_body);
    perform pg_advisory_xact_lock(hashtextextended(actor::text || p_key::text, 0));
    select * into saved from private.mutation_keys where actor_id = actor and key = p_key;
    if found then
      if saved.payload <> payload then raise sqlstate 'PT409' using message = 'Idempotency key reused with different input'; end if;
      select * into item from public.comments where id = saved.comment_id;
      return item;
    end if;
    if p_entity_id is null or not private.entity_visible(p_entity_id) or not exists(select 1 from public.content_entities where id = p_entity_id) then
      raise sqlstate 'PT404' using message = 'Entity not found';
    end if;
    if p_parent_id is not null then
      select * into parent from public.comments where id = p_parent_id for share;
      if not found or parent.entity_id <> p_entity_id or parent.parent_id is not null or parent.deleted_at is not null
        or (not owner_actor and parent.status <> 'approved') then
        raise sqlstate 'PT422' using message = 'Parent must be a visible root in the same entity';
      end if;
    end if;
  else
    select * into item from public.comments where id = p_id for update;
    if not found then raise sqlstate 'PT404' using message = 'Comment not found'; end if;
    if p_action = 'moderate' then
      if not owner_actor then raise sqlstate 'PT403' using message = 'Owner required'; end if;
      if p_status is null or p_status not in ('approved', 'rejected', 'hidden')
        or p_reason is null or length(btrim(p_reason, E' \t\r\n\v\f')) not between 1 and 500 then
        raise sqlstate 'PT422' using message = 'Valid status and moderation reason required';
      end if;
    elsif item.author_id is distinct from actor then
      raise sqlstate 'PT403' using message = 'Author required';
    end if;
    if item.deleted_at is not null then raise sqlstate 'PT404' using message = 'Comment deleted'; end if;
    if p_expected_version is null or p_expected_version <> item.version then
      raise sqlstate 'PT409' using message = 'Version conflict';
    end if;
  end if;
  -- Atomic DB-side quota survives direct RPC and multiple Edge instances.
  insert into private.write_windows(actor_id, window_start, count)
    values(actor, date_trunc('minute', statement_timestamp()), 1)
    on conflict (actor_id, window_start) do update set count = private.write_windows.count + 1
    returning count into window_count;
  if window_count > (case when owner_actor then 120 else 30 end) then
    raise sqlstate 'PT429' using message = 'Mutation quota exceeded';
  end if;
  if p_action = 'create' then
    insert into public.comments(entity_id, author_id, parent_id, body, status)
      values(p_entity_id, actor, p_parent_id, p_body, case when owner_actor then 'approved' else 'pending' end) returning * into item;
    insert into private.mutation_keys values(actor, p_key, payload, item.id);
  elsif p_action = 'edit' then
    update public.comments set body = p_body, status = case when owner_actor then 'approved' else 'pending' end,
      version = version + 1, updated_at = now() where id = item.id returning * into item;
  elsif p_action = 'delete' then
    update public.comments set body = '', status = 'hidden', deleted_at = now(), updated_at = now(), version = version + 1
      where id = item.id returning * into item;
  else
    update public.comments set status = p_status, version = version + 1, updated_at = now()
      where id = item.id returning * into item;
  end if;
  insert into public.comment_revisions(comment_id, version, actor_id, body, status) values(item.id, item.version, actor, item.body, item.status);
  insert into public.audit_events(actor_id, comment_id, version, action, reason) values(actor, item.id, item.version, p_action, case when p_action = 'moderate' then p_reason end);
  return item;
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
  'payload',case when p.feature='posts' then jsonb_build_object('title',r.title,'body',r.body,'kind',r.content_type,'category',r.category,'tags',r.tags,'series',coalesce(sname,''),'seriesId',r.series_id,'order',r.sort_order)
  else jsonb_build_object('title',r.title,'description',r.body,'category',r.category,'tags',r.tags,'sourceUrl',r.source_url,'url',r.canonical_url,'platform',r.provider) end);
end $$;

create or replace function private.entity_visible(p_entity uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare p private.publications;r private.help_requests;
begin
 if exists(select 1 from private.legacy_tombstones where entity_id=p_entity) then return private.is_owner();end if;
 select * into p from private.publications where entity_id=p_entity;
 if found then return p.deleted_at is null and (p.published_revision is not null or coalesce(p.author_id=auth.uid(),false) or private.is_owner());end if;
 select * into r from private.help_requests where entity_id=p_entity;
 if found then return r.deleted_at is null and (r.moderation='approved' or coalesce(r.author_id=auth.uid(),false) or private.is_owner());end if;
 return true;
end $$;
