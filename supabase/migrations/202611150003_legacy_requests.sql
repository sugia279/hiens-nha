-- Import evidence is private; a verified legacy login is never inferred from text metadata.
create table private.feature_imports(
 feature text not null check(feature in ('posts','media','requests')),legacy_key text not null,object_id uuid not null,
 checksum text not null,source_commit text not null,raw_record jsonb not null,primary key(feature,legacy_key)
);
alter table private.feature_imports enable row level security;
revoke all on private.feature_imports from public,anon,authenticated;
create function private.request_legacy(p_number integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare target uuid;
begin
 select id into target from private.help_requests where legacy_number=p_number;
 if target is null then raise sqlstate 'PT404' using message='Legacy request not found';end if;
 return private.request_json(target);
end $$;
revoke all on function private.request_legacy(integer) from public;
grant execute on function private.request_legacy(integer) to anon,authenticated;
create function public.request_legacy(p_number integer) returns jsonb language sql stable security invoker set search_path='' as $$select private.request_legacy(p_number)$$;
revoke all on function public.request_legacy(integer) from public;
grant execute on function public.request_legacy(integer) to anon,authenticated;
