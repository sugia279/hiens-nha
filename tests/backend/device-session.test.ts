// @vitest-environment happy-dom
import {it,expect,beforeEach} from 'vitest';
import {deviceStorage,DEVICE_SESSION_MS} from '../../src/lib/auth/device-storage';
beforeEach(()=>localStorage.clear());
it('restores only this project/site session, strips provider tokens and never persists PKCE',()=>{
 const storage=deviceStorage('site-a',localStorage,()=>1000);
 storage.setItem('site-a-code-verifier','private-verifier');storage.setItem('site-a',JSON.stringify({access_token:'a',refresh_token:'r',provider_token:'github-secret',provider_refresh_token:'github-refresh',user:{id:'user'}}));
 const fresh=deviceStorage('site-a',localStorage,()=>1001);
 expect(JSON.parse(fresh.getItem('site-a')!)).toEqual({access_token:'a',refresh_token:'r',user:{id:'user'}});
 expect(fresh.getItem('site-a-code-verifier')).toBeNull();expect(localStorage.getItem('site-a-code-verifier')).toBeNull();
 expect(localStorage.getItem('site-a')).not.toContain('github-secret');expect(deviceStorage('other-site',localStorage).getItem('other-site')).toBeNull();
});
it('remembers refreshed sessions beyond seven days and clears credentials on logout',()=>{
 let now=1000;const storage=deviceStorage('session',localStorage,()=>now);storage.setItem('session','{"access_token":"a"}');
 now+=100*DEVICE_SESSION_MS;storage.setItem('session','{"access_token":"rotated"}');expect(storage.expiresAt()).toBeNull();
 expect(deviceStorage('session',localStorage,()=>now).getItem('session')).toContain('rotated');
 storage.clear();storage.setItem('session','{"access_token":"late-refresh"}');expect(storage.getItem('session')).toBeNull();
 storage.beginLogin();storage.setItem('session','{"access_token":"new"}');storage.clear();expect(storage.getItem('session')).toBeNull();
});
it('migrates unexpired legacy envelopes and rejects stale refresh after cross-tab removal',()=>{
 localStorage.setItem('session',JSON.stringify({version:1,expiresAt:2000,value:'{"access_token":"legacy"}'}));
 const storage=deviceStorage('session',localStorage,()=>1000);expect(storage.getItem('session')).toContain('legacy');
 storage.setItem('session','{"access_token":"new"}');expect(JSON.parse(localStorage.getItem('session')!).version).toBe(2);
 localStorage.removeItem('session');storage.setItem('session','{"access_token":"late"}');expect(storage.getItem('session')).toBeNull();
 localStorage.setItem('expired',JSON.stringify({version:1,expiresAt:999,value:'{"access_token":"old"}'}));
 expect(deviceStorage('expired',localStorage,()=>1000).getItem('expired')).toBeNull();
});
it('clears corrupt records and falls back to isolated memory when storage is blocked',()=>{
 localStorage.setItem('session','not json');expect(deviceStorage('session',localStorage).getItem('session')).toBeNull();
 const storage=deviceStorage('session',{getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();}} as unknown as Storage);
 storage.setItem('session','{"refresh_token":"r"}');expect(storage.persistent).toBe(false);expect(storage.getItem('session')).toContain('r');
 expect(deviceStorage('session',null).getItem('session')).toBeNull();
});
