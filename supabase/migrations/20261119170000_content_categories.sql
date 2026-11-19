-- Public, explicitly-created vocabulary; never expose categories harvested from drafts.
create table private.content_categories (
 id text primary key default ('cat-' || gen_random_uuid()::text),
 scope text not null check(scope in ('photos','media','posts')),
 label text not null check(length(label) between 1 and 40 and label !~ '[[:cntrl:]]'),
 label_en text,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
create unique index content_categories_scope_label on private.content_categories(scope,lower(label));
alter table private.content_categories enable row level security;
revoke all on private.content_categories from public,anon,authenticated;
insert into private.content_categories(id,scope,label,label_en) values
 ('family','photos','Gia Đình','Family'),('scenery','photos','Phong cảnh','Scenery'),('moments','photos','Khoảnh Khắc','Moments'),
 ('video','media','Video yêu thích','Favorite videos'),('music','media','Nhạc yêu thích','Favorite music'),
 ('projects','posts','Dự Án','Projects'),('series','posts','Chuỗi bài','Series'),('novels','posts','Tủ Truyện','Novels');

create function private.content_categories_read() returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.admit_read();
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'scope',scope,'label',label,'label_en',label_en) order by created_at,id),'[]')
 into result from private.content_categories;
 return result;
end $$;
create function private.content_category_create(p_scope text,p_label text) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare item private.content_categories; clean text; actor uuid:=auth.uid(); used integer;
begin
 if actor is null then raise sqlstate 'PT401' using message='Authentication required'; end if;
 perform private.admit_read();
 if p_scope is null or p_scope not in ('photos','media','posts') or p_label is null or p_label ~ '[[:cntrl:]]' then
  raise sqlstate 'PT422' using message='Invalid category';end if;
 clean:=regexp_replace(btrim(normalize(p_label,NFC)),'[[:space:]]+',' ','g');
 if length(clean) not between 1 and 40 then raise sqlstate 'PT422' using message='Use 1-40 characters';end if;
 -- Scope lock makes duplicates and the cap atomic across concurrent callers.
 perform pg_advisory_xact_lock(hashtextextended('content-category:'||p_scope,0));
 select * into item from private.content_categories where scope=p_scope and (lower(label)=lower(clean) or lower(label_en)=lower(clean) or id=clean);
 if not found then
  if (select count(*) from private.content_categories where scope=p_scope)>=100 then raise sqlstate 'PT429' using message='Category limit reached';end if;
  if (select count(*) from private.content_categories where created_by=actor and created_at>=date_trunc('minute',statement_timestamp()))>=10 then
   raise sqlstate 'PT429' using message='Category creation quota exceeded';end if;
  -- Serialize per-actor creations across all three scopes as well.
  perform pg_advisory_xact_lock(hashtextextended('content-category-actor:'||actor::text,0));
  if (select count(*) from private.content_categories where created_by=actor and created_at>=date_trunc('minute',statement_timestamp()))>=10 then
   raise sqlstate 'PT429' using message='Category creation quota exceeded';end if;
  insert into private.content_categories(scope,label,created_by) values(p_scope,clean,actor) returning * into item;
 end if;
 return jsonb_build_object('id',item.id,'scope',item.scope,'label',item.label,'label_en',item.label_en);
end $$;
revoke all on function private.content_categories_read(),private.content_category_create(text,text) from public,anon,authenticated;
grant execute on function private.content_categories_read() to anon,authenticated;
grant execute on function private.content_category_create(text,text) to authenticated;
create function public.content_categories_read() returns jsonb language sql volatile security invoker set search_path='' as $$ select private.content_categories_read(); $$;
create function public.content_category_create(p_scope text,p_label text) returns jsonb language sql volatile security invoker set search_path='' as $$ select private.content_category_create(p_scope,p_label); $$;
revoke all on function public.content_categories_read(),public.content_category_create(text,text) from public,anon,authenticated;
grant execute on function public.content_categories_read() to anon,authenticated;
grant execute on function public.content_category_create(text,text) to authenticated;
notify pgrst,'reload schema';
