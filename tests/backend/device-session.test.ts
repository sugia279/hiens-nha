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
it('refresh does not extend the seven-day deadline; expiry and logout remove credentials',()=>{
 let now=1000;const storage=deviceStorage('session',localStorage,()=>now);storage.setItem('session','{"access_token":"a"}');
 now+=DEVICE_SESSION_MS-1;storage.setItem('session','{"access_token":"rotated"}');expect(storage.expiresAt()).toBe(1000+DEVICE_SESSION_MS);
 now++;expect(storage.getItem('session')).toBeNull();expect(localStorage.getItem('session')).toBeNull();
 storage.setItem('session','{"access_token":"late-refresh"}');expect(storage.getItem('session')).toBeNull();
 storage.beginLogin();storage.setItem('session','{"access_token":"new"}');storage.clear();expect(storage.getItem('session')).toBeNull();
});
it('clears corrupt records and falls back to isolated memory when storage is blocked',()=>{
 localStorage.setItem('session','not json');expect(deviceStorage('session',localStorage).getItem('session')).toBeNull();
 const storage=deviceStorage('session',{getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();}} as unknown as Storage);
 storage.setItem('session','{"refresh_token":"r"}');expect(storage.persistent).toBe(false);expect(storage.getItem('session')).toContain('r');
 expect(deviceStorage('session',null).getItem('session')).toBeNull();
});
