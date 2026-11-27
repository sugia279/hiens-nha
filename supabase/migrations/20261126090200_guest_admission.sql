-- Guest JWTs retain the public admission budget, not the member budget.
create or replace function private.admit_read() returns void language plpgsql volatile security definer set search_path='' as $$
declare bucket text; cap integer; used integer; tick timestamptz:=date_trunc('second',clock_timestamp());
 caller_class text:=case when auth.uid() is null or private.is_guest() then 'anon' when private.is_owner() then 'owner' else 'member' end;
begin
 if current_setting('request.method',true) in ('GET','HEAD') then
  raise sqlstate 'PT405' using message='Use POST for read RPC';
 end if;
 -- Do not return data under a client-requested rollback that would erase admission.
 if coalesce((nullif(current_setting('request.headers',true),'')::jsonb)->>'prefer','') ~* '(^|,)[[:space:]]*tx[[:space:]]*=' then
  raise sqlstate 'PT422' using message='Transaction preference is not supported';
 end if;
 if current_setting('pgrst.db_tx_end',true) in ('rollback','rollback-allow-override') then
  raise sqlstate 'PT503' using message='Read admission unavailable';
 end if;
 -- Fixed lock order across every worker and caller; no per-user/IP counter retention.
 foreach bucket in array array['global',caller_class] loop
  select max_per_second into cap from private.read_budgets where scope=bucket;
  if cap is null then raise sqlstate 'PT503' using message='Read admission unavailable';end if;
  insert into private.read_windows as w values(bucket,tick,1)
  on conflict(scope) do update set window_start=greatest(w.window_start,excluded.window_start),
   count=case when w.window_start<excluded.window_start then 1 else w.count+1 end
  where w.window_start<excluded.window_start or w.count<cap
  returning count into used;
  if used is null then raise sqlstate 'PT429' using message='Read budget exceeded';end if;
 end loop;
end $$;
