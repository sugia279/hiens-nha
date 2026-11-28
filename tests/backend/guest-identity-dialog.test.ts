// @vitest-environment happy-dom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {identifyGuest,type SocialRuntime} from '../../src/components/account/guest-identity-dialog';
import type {AuthSnapshot} from '../../src/lib/auth/runtime';
import {guestDialogFixture} from './helpers/guest-dialog';
let abort:AbortController;
beforeEach(()=>{
 document.body.innerHTML=guestDialogFixture;abort=new AbortController();
 vi.spyOn(HTMLDialogElement.prototype,'showModal').mockImplementation(function(this:HTMLDialogElement){this.open=true;});
 vi.spyOn(HTMLDialogElement.prototype,'close').mockImplementation(function(this:HTMLDialogElement){this.open=false;});
});
afterEach(()=>{abort.abort();vi.restoreAllMocks();});
function fixture(guest=true){
 let state:AuthSnapshot={user:{id:'current',role:'member',guest},busy:false,error:null};const listeners=new Set<(s:AuthSnapshot)=>void>();
 const runtime={api:{guestIdentity:vi.fn().mockResolvedValue({display_name:'Existing guest',chosen:true}),authProviders:vi.fn().mockResolvedValue({google:true,facebook:false,github:true})},current:()=>state,subscribe(fn:(s:AuthSnapshot)=>void){listeners.add(fn);fn(state);return()=>listeners.delete(fn);},signIn:vi.fn(),signOut:vi.fn(async()=>{state={...state,user:null};listeners.forEach(fn=>fn(state));})} as unknown as SocialRuntime;
 return runtime;
}
it('reopens a chosen guest identity, cancels without rewriting it, then renames only through the caller RPC',async()=>{
 const runtime=fixture();await identifyGuest(runtime,true,'/hiens-nha/',abort.signal);expect(document.querySelector('dialog')).toBeNull();
 const canceled=identifyGuest(runtime,true,'/hiens-nha/',abort.signal,true);
 await vi.waitFor(()=>expect(document.querySelector('dialog')).not.toBeNull());
 expect(document.querySelector<HTMLInputElement>('input')!.value).toBe('Existing guest');
 [...document.querySelectorAll('button')].find(b=>b.textContent==='Hủy')!.click();await canceled;
 expect(runtime.api.guestIdentity).toHaveBeenCalledTimes(2);
 const changed=identifyGuest(runtime,true,'/hiens-nha/',abort.signal,true);await vi.waitFor(()=>expect(document.querySelector('dialog')).not.toBeNull());
 document.querySelector<HTMLInputElement>('input')!.value='New name';[...document.querySelectorAll('button')].find(b=>b.textContent==='OK')!.click();await changed;
 expect(runtime.api.guestIdentity).toHaveBeenLastCalledWith('New name',true);expect(runtime.signOut).not.toHaveBeenCalled();
});
it('offers account switching or explicit reset to a verified visitor without allowing a guest name to overwrite their profile',async()=>{
 const runtime=fixture(false);const opened=identifyGuest(runtime,false,'/hiens-nha/',abort.signal,true);await vi.waitFor(()=>expect(document.querySelector('[data-provider="google"]')).not.toBeNull());
 await vi.waitFor(()=>expect(document.querySelector<HTMLButtonElement>('[data-provider="google"]')!.disabled).toBe(false));
 expect(document.querySelector('label')!.hidden).toBe(true);expect(runtime.api.guestIdentity).not.toHaveBeenCalled();
 document.querySelector<HTMLButtonElement>('[data-provider="google"]')!.click();expect(runtime.signIn).toHaveBeenCalledWith('/hiens-nha/en/account/callback/','google');
 document.querySelector<HTMLButtonElement>('[data-identity-reset]')!.click();await opened;expect(runtime.signOut).toHaveBeenCalledTimes(1);expect(runtime.current().user).toBeNull();expect(runtime.api.guestIdentity).not.toHaveBeenCalled();
});
it('uses the root English callback for Google when switching accounts',async()=>{
 const runtime=fixture(false);const opened=identifyGuest(runtime,false,'/',abort.signal,true);
 const button=()=>document.querySelector<HTMLButtonElement>('[data-provider="google"]');
 await vi.waitFor(()=>expect(button()?.disabled).toBe(false));button()!.click();
 expect(runtime.signIn).toHaveBeenCalledWith('/en/account/callback/','google');
 abort.abort();await opened;
});
it('does not start an identity transition while a social mutation is in flight and closes on navigation',async()=>{
 const runtime=fixture();runtime.current().socialBusy=true;await identifyGuest(runtime,true,'/hiens-nha/',abort.signal,true);expect(document.querySelector('dialog')).toBeNull();
 runtime.current().socialBusy=false;const opened=identifyGuest(runtime,true,'/hiens-nha/',abort.signal,true);await vi.waitFor(()=>expect(document.querySelector('dialog')).not.toBeNull());abort.abort();await opened;expect(document.querySelector('dialog')).toBeNull();expect(runtime.signOut).not.toHaveBeenCalled();
});
