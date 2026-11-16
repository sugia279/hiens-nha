import assert from 'node:assert/strict';
import postgres from 'postgres';
import {writeFile} from 'node:fs/promises';
import {localEnvironment} from '../../scripts/backend/local-environment.mjs';
import {initializeRehearsalSchema} from '../../scripts/migration/rehearsal-database.ts';
import {postgresAdapter} from '../../scripts/backend/postgres-adapter.mjs';
const env=await localEnvironment();
const name='hn_read_'+crypto.randomUUID().replaceAll('-','');
let sql,created=false,passed=false;
try {
 await env.sql.unsafe(`create database "${name}"`);created=true;
 const url=new URL(env.database);url.pathname='/'+name;
 sql=postgres(url.href,{max:12,onnotice:()=>{}});
 await initializeRehearsalSchema({...postgresAdapter(sql),exec:text=>sql.unsafe(text)});
 await sql.unsafe("update private.read_budgets set max_per_second=5 where scope='global'; insert into private.read_windows values('global',now()+interval '1 hour',1)");
 const results=await Promise.all(Array.from({length:12},async()=>{
  try {await sql.begin(async tx=>{await tx.unsafe('set local role anon');await tx.unsafe("select set_config('request.method','POST',true)");await tx.unsafe("select public.feature_state('posts')");});return 'ok';}
  catch(e){return e.code;}
 }));
 assert.equal(results.filter(x=>x==='ok').length,4);
 assert.equal(results.filter(x=>x==='PT429').length,8);
 assert.equal((await sql.unsafe("select count from private.read_windows where scope='global'"))[0].count,5);
 await sql.unsafe("update private.read_windows set window_start=now()-interval '1 minute'");
 await sql.begin(async tx=>{await tx.unsafe('set local role anon');await tx.unsafe("select public.feature_state('posts')");});
 assert.equal((await sql.unsafe("select count from private.read_windows where scope='global'"))[0].count,1);
 passed=true;
 await writeFile('backend-test-results/read-admission-summary.json',JSON.stringify({environment:'isolated loopback native PostgreSQL',passed,concurrentCalls:12,admitted:4,rateLimited:8,seededGlobalCount:1,globalCap:5,windowReset:true,hosted:false},null,2));
 console.log('Native shared read budget: atomic cap, concurrent rejection and expiry passed (isolated loopback).');
} catch(e){console.error('READ_ADMISSION_NATIVE_FAILED');process.exitCode=1;}
finally {if(sql)await sql.end();if(created)await env.sql.unsafe(`drop database "${name}" with (force)`);await env.sql.end();}
