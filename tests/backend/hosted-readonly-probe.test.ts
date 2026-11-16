import { expect, it } from 'vitest';
import { probe } from '../../scripts/backend/hosted-readonly-probe.mjs';
it('limits the hosted smoke to fixed anonymous GET/OPTIONS and redacts content',async()=>{
  const calls: any[]=[];const pauses:number[]=[];
  const report=await probe({pause:async(ms:number)=>{pauses.push(ms);},fetcher:async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
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
    const report=await probe({pause:async()=>{},fetcher:async()=>{
      calls++;if(kind==='network')throw Error('private credential fixture');
      return new Response(kind==='body'?'x'.repeat(65537):JSON.stringify(calls===1?{status:'ok',version:1}:{source:'api',epoch:1,writes_enabled:true}),{status:kind==='http'?500:200,headers:{'access-control-allow-origin':'https://sugia279.github.io'}});
    }});
    expect(report.passed).toBe(false);expect(calls).toBeLessThanOrEqual(2);expect(JSON.stringify(report)).not.toContain('private credential fixture');
  }
});
