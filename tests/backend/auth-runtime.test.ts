// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const sdk=vi.hoisted(()=>({changed:null as null|((event:string)=>void),hasSession:false,clear:vi.fn()}));
vi.mock('../../src/lib/auth/session',()=>({createAuth:()=>({storage:{expiresAt:()=>null,clear:sdk.clear,key:'test-session',persistent:true},auth:{
 getSession:async()=>({data:{session:sdk.hasSession?{access_token:'local-fixture'}:null},error:null}),
 onAuthStateChange:(fn:(event:string)=>void)=>{sdk.changed=fn;},signInWithOAuth:async()=>({data:{url:'http://127.0.0.1:54321/auth/v1/authorize'},error:null}),
 signOut:async()=>{sdk.hasSession=false;sdk.changed?.('SIGNED_OUT');return{error:null};},stopAutoRefresh:()=>{},startAutoRefresh:()=>{},
}}),oauthCode:()=>null}));
import {createBackendRuntime} from '../../src/lib/auth/runtime';
const config={supabaseUrl:'http://127.0.0.1:54321',apiBase:'http://127.0.0.1:54321/functions/v1/api/v1',publishableKey:'sb_publishable_fixture'};
beforeEach(()=>{sdk.hasSession=false;sdk.clear.mockClear();});
afterEach(()=>{window.dispatchEvent(new Event('pagehide'));vi.unstubAllGlobals();vi.restoreAllMocks();});
it('a late identity refresh cannot resurrect an automatically signed-out session',async()=>{
 let resolve!:(r:Response)=>void;const fetcher=vi.fn<typeof fetch>().mockReturnValue(new Promise(r=>resolve=r));vi.stubGlobal('fetch',fetcher);
 const runtime=createBackendRuntime(config);await runtime.ready;sdk.hasSession=true;const refresh=runtime.refresh();await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));sdk.changed!('SIGNED_OUT');
 resolve(new Response(JSON.stringify({id:'old-user',role:'owner'})));await refresh;expect(runtime.current()).toMatchObject({user:null,busy:false,error:null});
});
it('restores a saved session only after server identity verification, then clears this device on logout',async()=>{
 sdk.hasSession=true;let resolve!:(r:Response)=>void;vi.stubGlobal('fetch',vi.fn().mockReturnValue(new Promise(r=>resolve=r)));
 const runtime=createBackendRuntime(config);expect(runtime.current().user).toBeNull();await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'));
 resolve(new Response(JSON.stringify({id:'member',role:'member'})));await runtime.ready;expect(runtime.current().user).toEqual({id:'member',role:'member'});
 await runtime.signOut();expect(runtime.current().user).toBeNull();expect(sdk.clear).toHaveBeenCalled();
});
it('unverified or signed-out UI reads never attach a cached session token',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockImplementation(async input=>new Response(JSON.stringify(String(input).endsWith('/me')?{id:'member',role:'member'}:{items:[],nextCursor:null})));vi.stubGlobal('fetch',fetcher);
 const runtime=createBackendRuntime(config);await runtime.ready;sdk.hasSession=true;await runtime.api.comments('entity');expect(new Headers(fetcher.mock.calls[0]![1]?.headers).has('authorization')).toBe(false);
 await runtime.refresh();await runtime.api.comments('entity');expect(new Headers(fetcher.mock.calls[2]![1]?.headers).get('authorization')).toBe('Bearer local-fixture');
 sdk.changed!('SIGNED_OUT');await runtime.api.comments('entity');expect(new Headers(fetcher.mock.calls[3]![1]?.headers).has('authorization')).toBe(false);
});
