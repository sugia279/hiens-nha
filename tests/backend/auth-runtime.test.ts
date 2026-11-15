// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
const sdk=vi.hoisted(()=>({changed:null as null|((event:string)=>void)}));
vi.mock('../../src/lib/auth/session',()=>({
  createAuth:()=>({auth:{
    getSession:async()=>({data:{session:{access_token:'local-fixture'}},error:null}),
    onAuthStateChange:(fn:(event:string)=>void)=>{sdk.changed=fn;},
    signInWithOAuth:async()=>({data:{url:'http://127.0.0.1:54321/auth/v1/authorize'},error:null}),
    stopAutoRefresh:()=>{},
  }}), oauthCode:()=>null,
}));
import { createBackendRuntime } from '../../src/lib/auth/runtime';
afterEach(()=>{window.dispatchEvent(new Event('pagehide'));vi.unstubAllGlobals();vi.restoreAllMocks();});
it('a late identity refresh cannot resurrect an automatically signed-out session',async()=>{
  let resolve!:(r:Response)=>void;const fetcher=vi.fn<typeof fetch>().mockReturnValue(new Promise(r=>{resolve=r;}));vi.stubGlobal('fetch',fetcher);
  vi.spyOn(window,'open').mockReturnValue({closed:false,close:()=>{},location:{href:''}} as Window);
  const runtime=createBackendRuntime({supabaseUrl:'http://127.0.0.1:54321',apiBase:'http://127.0.0.1:54321/functions/v1/api/v1',publishableKey:'sb_publishable_fixture'});
  await runtime.signIn('/hiens-nha/account/callback/');const refresh=runtime.refresh();
  await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));sdk.changed!('SIGNED_OUT');
  resolve(new Response(JSON.stringify({id:'old-user',role:'owner'}),{headers:{'content-type':'application/json'}}));await refresh;
  expect(runtime.current()).toMatchObject({user:null,busy:false,error:null});
});

it('unverified or signed-out UI reads never attach a cached session token',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockImplementation(async input=>new Response(JSON.stringify(String(input).endsWith('/me')?{id:'member',role:'member'}:{items:[],nextCursor:null}),{headers:{'content-type':'application/json'}}));vi.stubGlobal('fetch',fetcher);
  vi.spyOn(window,'open').mockReturnValue({closed:false,close:()=>{},location:{href:''}} as Window);
  const runtime=createBackendRuntime({supabaseUrl:'http://127.0.0.1:54321',apiBase:'http://127.0.0.1:54321/functions/v1/api/v1',publishableKey:'sb_publishable_fixture'});
  await runtime.signIn('/hiens-nha/account/callback/');await runtime.api.comments('entity');
  expect(new Headers(fetcher.mock.calls[0]![1]?.headers).has('authorization')).toBe(false);
  await runtime.refresh();await runtime.api.comments('entity');
  expect(new Headers(fetcher.mock.calls[2]![1]?.headers).get('authorization')).toBe('Bearer local-fixture');
  sdk.changed!('SIGNED_OUT');await runtime.api.comments('entity');
  expect(new Headers(fetcher.mock.calls[3]![1]?.headers).has('authorization')).toBe(false);
});
