import { expect, it } from 'vitest';
import { probe, readExpectedSources } from '../../scripts/backend/hosted-readonly-probe.mjs';
import { readFileSync } from 'node:fs';
const gitSources=()=>{
  const marker=()=>({source:'git' as const,epoch:0});
  return {comments:marker(),posts:marker(),media:marker(),requests:marker()};
};
it('limits the hosted smoke to fixed anonymous GET/OPTIONS and redacts content',async()=>{
  const calls: any[]=[];const pauses:number[]=[];
  const report=await probe({sources:gitSources(),pause:async(ms:number)=>{pauses.push(ms);},fetcher:async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=String(input), options=init!, headers=options.headers as Record<string,string>;
    calls.push({url,options});
    const path=new URL(url).pathname;
    const denied=headers.Origin==='https://untrusted.invalid';
    const status=denied?403:options.method==='OPTIONS'?204:path.endsWith('/me')||path.endsWith('/admin/moderation')?401:200;
    const body=status===204?null:JSON.stringify(status===403?{code:'ORIGIN_DENIED'}:status===401?{code:'UNAUTHENTICATED'}:path.endsWith('/health')?{status:'ok',version:1}:path.endsWith('/state')?{source:'git',epoch:0,writes_enabled:false}:{items:[{privateFixture:'never print'}]});
    return new Response(body,{status,headers:denied?{}:{'access-control-allow-origin':'https://sugia279.github.io'}});
  }});
  expect(report.passed).toBe(true);expect(calls).toHaveLength(12);expect(pauses).toEqual(Array(12).fill(1000));
  for(const {url,options} of calls){expect(new URL(url).hostname).toBe('eqxlywwvchmzuyqtxexu.supabase.co');expect(['GET','OPTIONS']).toContain(options.method);expect(options.redirect).toBe('error');expect(Object.keys(options.headers).some(k=>/authorization|apikey/i.test(k))).toBe(false);expect(options.body).toBeUndefined();}
  expect(JSON.stringify(report)).not.toContain('never print');expect(report.hostedPerformanceGatePassed).toBe(false);
});
it('stops on changed source, HTTP failure or bounded-body failure without logging raw errors',async()=>{
  for(const kind of ['source','http','network','body']){
    let calls=0;
    const report=await probe({sources:gitSources(),pause:async()=>{},fetcher:async()=>{
      calls++;if(kind==='network')throw Error('private credential fixture');
      return new Response(kind==='body'?'x'.repeat(65537):JSON.stringify(calls===1?{status:'ok',version:1}:{source:'api',epoch:1,writes_enabled:true}),{status:kind==='http'?500:200,headers:{'access-control-allow-origin':'https://sugia279.github.io'}});
    }});
    expect(report.passed).toBe(false);expect(calls).toBeLessThanOrEqual(2);expect(JSON.stringify(report)).not.toContain('private credential fixture');
  }
});
it('uses the current versioned markers instead of assuming all sources are Git0',()=>{
  const comments=JSON.parse(readFileSync('config/comments-source.json','utf8'));
  const features=JSON.parse(readFileSync('config/feature-sources.json','utf8'));
  expect(readExpectedSources()).toEqual({comments,posts:features.posts,media:features.media,requests:features.requests});
});
it('accepts independent API epochs with either writer state and records only safe control metadata',async()=>{
  const sources={...gitSources(),comments:{source:'api',epoch:1},posts:{source:'api',epoch:3},media:{source:'git',epoch:2}};
  for(const enabled of [false,true]){
    const report=await probe({sources,pause:async()=>{},fetcher:async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
      const path=new URL(String(input)).pathname,denied=(init!.headers as Record<string,string>).Origin==='https://untrusted.invalid';
      const status=denied?403:init!.method==='OPTIONS'?204:path.endsWith('/me')||path.endsWith('/admin/moderation')?401:200;
      const feature=path.endsWith('/features/posts/state')?'posts':path.endsWith('/features/media/state')?'media':path.endsWith('/features/requests/state')?'requests':'comments';
      const marker=sources[feature];
      const body=status===204?null:JSON.stringify(status===403?{code:'ORIGIN_DENIED'}:status===401?{code:'UNAUTHENTICATED'}:path.endsWith('/health')?{status:'ok',version:1}:path.endsWith('/state')?{...marker,writes_enabled:marker.source==='api'?enabled:false,privateFixture:'never print'}:{items:[]});
      return new Response(body,{status,headers:denied?{}:{'access-control-allow-origin':'https://sugia279.github.io'}});
    }});
    expect(report.passed).toBe(true);expect(report.requests).toBe(12);
    expect(report.results.find(r=>r.name==='posts-state')).toMatchObject({observedState:{source:'api',epoch:3,writes_enabled:enabled}});
    expect(report.apiWriterIntentVerified).toBe(false);expect(JSON.stringify(report)).not.toContain('never print');
  }
});
it('fails before network on invalid expected markers and stops on stale epochs or invalid writer values',async()=>{
  for(const sources of [null,{}, {...gitSources(),posts:{source:'api',epoch:0}}, {...gitSources(),media:{source:'api',epoch:-1}}]){
    let calls=0;
    // Deliberately malformed runtime input exercises fail-closed validation beyond the typed caller contract.
    await expect(probe({sources:sources as ReturnType<typeof gitSources>,pause:async()=>{},fetcher:async()=>{calls++;throw Error('must not fetch');}})).rejects.toThrow();
    expect(calls).toBe(0);
  }
  for(const state of [{source:'api',epoch:2,writes_enabled:false},{source:'api',epoch:1,writes_enabled:'false'},{source:'git',epoch:0,writes_enabled:true}]){
    const sources={...gitSources(),comments:{source:state.source,epoch:state.source==='api'?1:0}};let calls=0;
    const report=await probe({sources,pause:async()=>{},fetcher:async()=>{
      calls++;return new Response(JSON.stringify(calls===1?{status:'ok',version:1}:state),{headers:{'access-control-allow-origin':'https://sugia279.github.io'}});
    }});
    expect(report.passed).toBe(false);expect(calls).toBe(2);expect(report.results[1]).not.toHaveProperty('observedState');
  }
});
