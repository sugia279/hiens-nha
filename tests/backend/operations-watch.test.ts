import {testDatabase} from './helpers/database';
import {it,expect} from 'vitest';
import {expectedControls,lastHour,evaluateOperations,backupObservation,controlsQuery,logQuery} from '../../scripts/backend/operations-watch.mjs';
const git={source:'git',epoch:0},api={source:'api',epoch:1};
const expected=expectedControls({...git,version:1},{version:1,posts:api,media:git,requests:api});
const controls={comments:[{feature:'comments',...git,writes:false}],features:[{feature:'posts',...api,writes:true},{feature:'media',...git,writes:false},{feature:'requests',...api,writes:false}],quota_samples:[] as any[]};
const window={window_start:'2026-11-16T10:00:00Z',events:100,status_events:100,responses_5xx:1,execution_events:100,execution_p95_ms:1999};
const run=(changes:any={})=>evaluateOperations({expected,controls,windows:[window],health:{status:200},...changes});
it('accepts a legitimate mixed feature cutover and does not permanently expect Git0',()=>{
 expect(run().notify).toBe(false);expect(run({windows:[]}).notify).toBe(false);
 expect(lastHour(new Date('2026-11-16T11:00:00Z'))).toEqual({iso_timestamp_start:'2026-11-16T10:00:00.000Z',iso_timestamp_end:'2026-11-16T11:00:00.000Z'});
 expect(()=>expectedControls(git,{})).toThrow('MAIN_SOURCE_CONFIGURATION_UNAVAILABLE');
});
it('enforces exact threshold and sample boundaries, not health from absent data',()=>{
 expect(run({windows:[{...window,status_events:19,responses_5xx:19,execution_events:19,execution_p95_ms:5000}]}).notify).toBe(false);
 expect(run({windows:[{...window,status_events:20,responses_5xx:1,execution_events:20,execution_p95_ms:2000}]}).alerts.map((a:any)=>a.code)).toEqual(['EDGE_5XX','EDGE_EXECUTION_P95']);
 expect(run({windows:[{...window,status_events:0,responses_5xx:0,execution_events:0,execution_p95_ms:null}]}).notify).toBe(false);
 expect(run({windows:[{...window,events:1,status_events:20}]}).alerts[0].code).toBe('MONITORING_UNAVAILABLE');
});
it('reports mismatch/cutover possibility, missing monitoring and unhealthy writer without changing state',()=>{
 const snapshot=JSON.stringify(controls);
 expect(run({controls:{...controls,features:controls.features.map(x=>x.feature==='posts'?{...x,epoch:2}:x)}}).alerts[0]).toMatchObject({code:'SOURCE_EPOCH_MISMATCH',possibleCutoverWindow:true});
 expect(run({controls:{...controls,comments:[]},health:{status:503},windows:null}).notify).toBe(true);
 expect(run({controls:{...controls,comments:[{feature:'comments',...git,writes:true}]}}).alerts[0].code).toBe('WRITER_STATE_INVALID');
 expect(JSON.stringify(controls)).toBe(snapshot);
});
it('uses only current mutation quota aggregates with the >=80% boundary',()=>{
 expect(run({controls:{...controls,quota_samples:[{feature:'posts',saturation:.8}]}}).alerts[0].code).toBe('MUTATION_QUOTA_SAMPLE_SATURATED');
 expect(controlsQuery).not.toMatch(/select\s+\*/i);expect(logQuery).toContain("source='function_edge_logs'");
});
it('does not equate an encrypted artifact with restore/decryption verification',()=>{
 const a={name:'hiens-nha-encrypted-backup-1',created_at:'2026-11-15T11:00:00Z',expires_at:'2026-12-15T11:00:00Z',expired:false,size_in_bytes:100};
 expect(backupObservation({artifacts:[a],now:new Date('2026-11-16T11:00:00Z')})).toMatchObject({available:true,stale:false,recoveryVerified:false});
 expect(backupObservation({artifacts:[a],now:new Date('2026-11-16T11:00:01Z')})).toMatchObject({stale:true});
 expect(backupObservation({artifacts:[{...a,expired:true}],now:new Date('2026-11-16T11:00:00Z')})).toMatchObject({available:false});
});

it('executes the aggregate SQL without emitting user identities or content',async()=>{
 const db=await testDatabase();
 try {
  const result=(await db.query<any>(controlsQuery)).rows[0];
  expect(result.comments[0]).toMatchObject({feature:'comments',source:'git',epoch:0,writes:false});
  expect(result.features).toHaveLength(3);expect(result.quota_samples).toEqual([{feature:'comments',saturation:0}]);
 } finally {await db.close();}
},30000);
