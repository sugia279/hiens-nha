import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { validateSource } from '../../supabase/functions/_shared/source-mode.mjs';
const base = 'https://eqxlywwvchmzuyqtxexu.supabase.co/functions/v1/api/v1';
const origin = 'https://sugia279.github.io';
const features = ['comments','posts','media','requests'];
export function readExpectedSources() {
  const [comments,other] = ['comments-source.json','feature-sources.json'].map(name =>
    JSON.parse(readFileSync(new URL('../../config/' + name, import.meta.url),'utf8')));
  if(comments?.version!==1 || other?.version!==1) throw Error('Invalid source marker version');
  return {comments,...Object.fromEntries(features.slice(1).map(f=>[f,other[f]]))};
}
const casesFor = expected => {
const state = feature => body => body?.source===expected[feature].source && body.epoch===expected[feature].epoch &&
  typeof body.writes_enabled==='boolean' && (body.source!=='git' || body.writes_enabled===false);
return [
  ['health','/health',200,b=>b?.status==='ok' && b.version===1],
  ['comments-state','/state',200,state('comments')],
  ...['posts','media','requests'].map(f=>[f+'-state','/features/'+f+'/state',200,state(f)]),
  ...['posts','media','requests'].map(f=>[f+'-public','/'+f+'?limit=1',200,b=>Array.isArray(b?.items) && b.items.length<=1]),
  ['anonymous-owner','/me',401,b=>b?.code==='UNAUTHENTICATED'],
  ['anonymous-admin','/admin/moderation',401,b=>b?.code==='UNAUTHENTICATED'],
  ['denied-origin','/health',403,b=>b?.code==='ORIGIN_DENIED',{Origin:'https://untrusted.invalid'}],
  ['allowed-preflight','/health',204,()=>true,{Origin:origin,'Access-Control-Request-Method':'GET'},'OPTIONS'],
];
};
/** Fixed public target, no token/key/body/URL inputs, no writes or retry loop. Not a load test. */
export async function probe({ fetcher=fetch, pause=ms=>new Promise(r=>setTimeout(r,ms)), clock=()=>performance.now(), sources=readExpectedSources() }={}) {
  // Validate the complete expected configuration before the first request. CLI has no marker overrides.
  const expected=Object.fromEntries(features.map(f=>{
    const {source,epoch}=validateSource(sources?.[f]);return [f,{source,epoch}];
  }));
  const cases=casesFor(expected);
  const results=[];
  for (const [name,path,status,validate,extra={},method='GET'] of cases) {
    const start=clock();
    try {
      const response=await fetcher(base+path,{method,headers:{Origin:origin,...extra},redirect:'error',signal:AbortSignal.timeout(10000)});
      const reader=response.body?.getReader(); let size=0, text='';
      const decoder=new TextDecoder();
      if(reader) for(;;) {
        const {done,value}=await reader.read(); if(done) break;
        size+=value.byteLength; if(size>65536){await reader.cancel();throw Error('BODY_BOUND');}
        text+=decoder.decode(value,{stream:true});
      }
      text+=decoder.decode();
      const body=status===204 ? null : JSON.parse(text);
      const cors=response.headers.get('access-control-allow-origin');
      const passed=response.status===status && validate(body) && (name==='denied-origin' ? cors===null : cors===origin);
      const stateFeature=name.endsWith('-state')?name.slice(0,-6):null;
      results.push({name,status:response.status,expectedStatus:status,durationMs:Math.round(clock()-start),passed,
        ...(stateFeature && passed?{observedState:{source:body.source,epoch:body.epoch,writes_enabled:body.writes_enabled}}:{})});
      if(!passed) break; // Preserve failure; no changed-target or retry fallback.
    } catch {results.push({name,code:'PROBE_FAILED',durationMs:Math.round(clock()-start),passed:false});break;}
    await pause(1000); // One outstanding request; at most 12 total, at least 1s apart.
  }
  return {version:1,createdAt:new Date().toISOString(),projectRef:'eqxlywwvchmzuyqtxexu',scope:'bounded anonymous read-only hosted smoke; generator location unverified',expectedSources:expected,requests:results.length,results,passed:results.length===cases.length && results.every(r=>r.passed),apiWriterIntentVerified:false,hostedPerformanceGatePassed:false,globalIngressGatePassed:false};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.slice(2).join(' ')!=='--confirm-read-only') {console.error('Explicit --confirm-read-only required; no other inputs accepted.');process.exitCode=1;}
  else {try {const report=await probe();console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;}
    catch {console.error('SOURCE_MARKERS_INVALID');process.exitCode=1;}}
}
