/** Read-only contract for connected monitoring. Never accepts credentials or raw logs. */
export const productionProject='eqxlywwvchmzuyqtxexu';
export const logQuery="select toStartOfInterval(timestamp, INTERVAL 5 MINUTE) as window_start, count() as events, countIf(mapContains(log_attributes,'response.status_code')) as status_events, countIf(toUInt16OrZero(log_attributes['response.status_code'])>=500) as responses_5xx, countIf(mapContains(log_attributes,'execution_time_ms')) as execution_events, quantileIf(0.95)(toUInt64OrZero(log_attributes['execution_time_ms']),mapContains(log_attributes,'execution_time_ms')) as execution_p95_ms from logs where source='function_edge_logs' group by window_start order by window_start";
export const controlsQuery=`select now() as sampled_at,
 (select jsonb_agg(jsonb_build_object('feature','comments','source',comments_source,'epoch',comments_epoch,'writes',comments_writes_enabled)) from private.backend_settings) as comments,
 (select jsonb_agg(jsonb_build_object('feature',feature,'source',source,'epoch',epoch,'writes',writes_enabled) order by feature) from private.feature_controls) as features,
 (select jsonb_agg(q order by feature) from (
  select 'comments' as feature,coalesce(max(w.count::float/case when r.role='owner' then 120 else 30 end),0) as saturation
  from private.write_windows w left join public.role_assignments r on r.user_id=w.actor_id where w.window_start=date_trunc('minute',now())
  union all select w.feature,coalesce(max(w.count::float/case when r.role='owner' then 120 else 30 end),0)
  from private.feature_windows w left join public.role_assignments r on r.user_id=w.actor_id where w.window_start=date_trunc('minute',now()) group by w.feature
 ) q) as quota_samples`;
export function expectedControls(comments,features){
 if(comments?.version!==1||features?.version!==1)throw new Error('MAIN_SOURCE_CONFIGURATION_UNAVAILABLE');
 const all={comments,...Object.fromEntries(['posts','media','requests'].map(k=>[k,features?.[k]]))};
 for(const value of Object.values(all)) if(!value||!['git','api'].includes(value.source)||!Number.isSafeInteger(value.epoch)||value.epoch<0)throw new Error('MAIN_SOURCE_CONFIGURATION_UNAVAILABLE');
 return Object.fromEntries(Object.entries(all).map(([k,v])=>[k,{source:v.source,epoch:v.epoch}]));
}
export function lastHour(end=new Date()){
 const n=+end;if(!Number.isFinite(n))throw new Error('INVALID_MONITOR_WINDOW');
 return {iso_timestamp_start:new Date(n-3600000).toISOString(),iso_timestamp_end:new Date(n).toISOString()};
}
export function evaluateOperations({expected,controls,windows,health,unavailable=[]}){
 const alerts=unavailable.map(component=>({code:'MONITORING_UNAVAILABLE',component}));
 if(!health||health.status!==200)alerts.push({code:'HEALTH_FAILED',status:health?.status??null});
 const rows=[...(controls?.comments??[]),...(controls?.features??[])];
 for(const [feature,want]of Object.entries(expected)){
  const found=rows.filter(x=>x.feature===feature);
  if(found.length!==1||!['git','api'].includes(found[0]?.source)||!Number.isSafeInteger(found[0]?.epoch)||typeof found[0]?.writes!=='boolean')alerts.push({code:'CONTROLS_UNAVAILABLE',feature});
  else {
   const actual=found[0];
   if(actual.source!==want.source||actual.epoch!==want.epoch)alerts.push({code:'SOURCE_EPOCH_MISMATCH',feature,expected:want,actual:{source:actual.source,epoch:actual.epoch},possibleCutoverWindow:true});
   if(actual.writes&&(actual.source!=='api'||actual.epoch<1))alerts.push({code:'WRITER_STATE_INVALID',feature});
  }
 }
 for(const q of controls?.quota_samples??[])if(Number.isFinite(q.saturation)&&q.saturation>=.8)alerts.push({code:'MUTATION_QUOTA_SAMPLE_SATURATED',feature:q.feature,saturation:q.saturation});
 if(!Array.isArray(windows))alerts.push({code:'MONITORING_UNAVAILABLE',component:'aggregate_logs'});
 else for(const w of windows){
  if(![w.events,w.status_events,w.responses_5xx,w.execution_events].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0)||(w.execution_events>0&&!(typeof w.execution_p95_ms==='number'&&Number.isFinite(w.execution_p95_ms)&&w.execution_p95_ms>=0))||w.responses_5xx>w.status_events||w.status_events>w.events||w.execution_events>w.events){alerts.push({code:'MONITORING_UNAVAILABLE',component:'aggregate_log_shape'});continue;}
  if(w.status_events>=20&&w.responses_5xx/w.status_events>.01)alerts.push({code:'EDGE_5XX',window:w.window_start,samples:w.status_events,ratio:w.responses_5xx/w.status_events});
  if(w.execution_events>=20&&w.execution_p95_ms>=2000)alerts.push({code:'EDGE_EXECUTION_P95',window:w.window_start,samples:w.execution_events,p95_ms:w.execution_p95_ms});
 }
 return {alerts,notify:alerts.length>0,observationsOnly:true};
}
export function backupObservation({artifacts,now=new Date(),maxAgeHours=24}){
 if(!Array.isArray(artifacts)||!Number.isFinite(+now))throw new Error('BACKUP_INVENTORY_UNAVAILABLE');
 const candidates=artifacts.filter(a=>a.name?.startsWith('hiens-nha-encrypted-backup-')&&!a.expired&&Number.isFinite(Date.parse(a.created_at))&&Date.parse(a.created_at)<=+now&&Date.parse(a.expires_at)>+now&&a.size_in_bytes>0).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
 const latest=candidates[0];
 return {available:!!latest,ageHours:latest?(+now-Date.parse(latest.created_at))/3600000:null,stale:!latest||(+now-Date.parse(latest.created_at))/3600000>maxAgeHours,artifactOnly:true,recoveryVerified:false};
}
