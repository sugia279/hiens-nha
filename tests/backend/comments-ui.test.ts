// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountComments } from '../../src/components/comments/controller';
import { mountModerationQueue } from '../../src/components/admin/moderation';
import type { BackendRuntime, AuthSnapshot } from '../../src/lib/auth/runtime';
import { ApiError, type Comment } from '../../supabase/functions/_shared/contracts';
import {guestDialogFixture} from './helpers/guest-dialog';
const item: Comment = {id:'10000000-0000-0000-0000-000000000001',entity_id:'20000000-0000-0000-0000-000000000001',author_id:'a',parent_id:null,body:'<img src=x onerror=alert(1)>',status:'pending',version:1,created_at:'2026-11-14T00:00:00Z',updated_at:'2026-11-14T00:00:00Z',deleted_at:null};
function mockRuntime() {
  let snapshot:AuthSnapshot={user:{id:'a',role:'member'},busy:false,error:null}; const listeners=new Set<(s:AuthSnapshot)=>void>();
  const api={state:vi.fn().mockResolvedValue({source:'api',epoch:1,writes_enabled:true}),resolveEntity:vi.fn().mockResolvedValue({id:item.entity_id}),comments:vi.fn().mockResolvedValue({items:[item],nextCursor:null}),moderation:vi.fn().mockResolvedValue({items:[item],nextCursor:null}),createComment:vi.fn().mockResolvedValue(item),editComment:vi.fn().mockResolvedValue(item),deleteComment:vi.fn().mockResolvedValue(item),moderate:vi.fn().mockResolvedValue(item)};
  return {api,current:()=>snapshot,subscribe(fn:(s:AuthSnapshot)=>void){listeners.add(fn);fn(snapshot);return()=>listeners.delete(fn);}, setUser(user:AuthSnapshot['user']){snapshot={...snapshot,user};listeners.forEach(fn=>fn(snapshot));}} as unknown as Pick<BackendRuntime,'api'|'subscribe'|'current'> & {setUser(user:AuthSnapshot['user']):void};
}
function panel() {
  document.body.innerHTML='<section data-locale="vi" data-epoch="1" data-context="/hiens-nha/music/"><p data-comments-status></p><button data-comments-refresh></button><button data-comments-mine></button><form data-comment-form><p data-compose-context></p><textarea></textarea><button data-comment-save type="submit"></button><button data-compose-cancel type="button"></button></form><div data-comment-list></div><button data-comments-more></button></section>';
  document.body.insertAdjacentHTML('beforeend',guestDialogFixture);
  Object.assign(document.querySelector('section')!.dataset,{deleteConfirm:'Xóa bình luận này?',deleteSuccess:'Đã xóa bình luận.',bodyError:'Nhập từ 1 đến 4.000 ký tự.',identityError:'Chưa tải được danh tính. Thử lại.'});
  Object.assign(document.querySelector('section')!.dataset,{conflictError:'Phiên bản đã đổi. Tải lại để kiểm tra; bản nháp được giữ.',limitError:'Gửi quá nhanh. Chờ một phút; bản nháp được giữ.',saveError:'Chưa tải/lưu được. Thử lại; bản nháp được giữ.'});
  Object.assign(document.querySelector('section')!.dataset,{empty:'Chưa có bình luận.',maintenance:'Bình luận đang bảo trì.',readOnly:'Bình luận đang ở chế độ chỉ đọc.',sent:'Đã gửi bình luận.',pending:'Đã lưu bình luận, đang chờ Hiển duyệt.',hiddenEdit:'Đã lưu chỉnh sửa. Bình luận vẫn đang ẩn.'});
  return document.querySelector('section')!;
}
const flush=async()=>{await vi.waitFor(()=>expect(document.querySelector('[data-comment-list]')?.children.length).toBeGreaterThan(0));};
beforeEach(()=>{document.body.innerHTML='';});
describe('comments DOM contracts',()=>{
  it('opens the Home composer in place, including sign-in for guests, and removes the opener listener on dispose',async()=>{
    const el=panel(),runtime=mockRuntime();
    el.dataset.homeComments='true';
    const opener=document.createElement('button');opener.dataset.openHomeComments='';opener.setAttribute('aria-expanded','false');el.before(opener);
    const wrapper=document.createElement('div');wrapper.dataset.commentsComposer='';
    const form=el.querySelector('form')!;form.before(wrapper);wrapper.append(form);
    const login=document.createElement('button');login.dataset.signIn='';wrapper.prepend(login);
    runtime.setUser(null);
    const stop=mountComments(el,runtime);await flush();
    expect(wrapper.hidden).toBe(true);expect(form.hidden).toBe(true);
    opener.click();expect(wrapper.hidden).toBe(false);expect(document.activeElement).toBe(login);
    expect(opener.getAttribute('aria-expanded')).toBe('true');
    runtime.setUser({id:'a',role:'member'});await flush();expect(form.hidden).toBe(false);
    wrapper.hidden=true;stop();opener.click();expect(wrapper.hidden).toBe(true);
  });
  it('renders approved bubbles without approval badges and reports an immediate committed save',async()=>{
    const el=panel(),runtime=mockRuntime();
    const approved={...item,status:'approved' as const};
    vi.mocked(runtime.api.comments).mockResolvedValue({items:[approved],nextCursor:null});
    vi.mocked(runtime.api.createComment).mockResolvedValue({...approved,id:'10000000-0000-0000-0000-000000000009',body:'new comment'});
    mountComments(el,runtime);await flush();
    expect(el.querySelector('.comment-bubble .comment-author')).not.toBeNull();
    expect(el.querySelector('.comment-status')).toBeNull();expect(el.querySelector('time')?.dateTime).toBe(item.created_at);
    expect(el.querySelector('[data-comments-status]')?.textContent).toBe('');
    el.querySelector('textarea')!.value='new comment';el.querySelector('form')!.dispatchEvent(new Event('submit',{cancelable:true}));
    await vi.waitFor(()=>expect(el.querySelector('[data-comments-status]')?.textContent).toBe('Đã gửi bình luận.'));
    expect(el.querySelector('[data-comment-list]')?.firstElementChild?.textContent).toContain('new comment');
  });
  it('preserves a guest reply target across sign-in and shows the committed reply immediately',async()=>{
    const el=panel(),runtime=mockRuntime();runtime.setUser(null);
    const root={...item,status:'approved' as const};
    vi.mocked(runtime.api.comments).mockResolvedValue({items:[root],nextCursor:null});
    vi.mocked(runtime.api.createComment).mockResolvedValue({...root,id:'10000000-0000-0000-0000-000000000009',parent_id:item.id,body:'reply'});
    mountComments(el,runtime);await flush();
    [...el.querySelectorAll('button')].find(b=>b.textContent==='Trả lời')!.click();
    runtime.setUser({id:'b',role:'member'});await flush();
    el.querySelector('textarea')!.value='reply';el.querySelector('form')!.dispatchEvent(new Event('submit',{cancelable:true}));
    await vi.waitFor(()=>expect(runtime.api.createComment).toHaveBeenCalledWith(item.entity_id,'reply',expect.any(String),item.id));
    await vi.waitFor(()=>expect(el.querySelector('.comment-replies')?.textContent).toContain('reply'));
  });
  it('renders malicious text as text and never exposes edit actions to another member',async()=>{
    const el=panel(),runtime=mockRuntime();runtime.setUser({id:'b',role:'member'});mountComments(el,runtime);await flush();
    expect(el.querySelector('[data-comment-list] img')).toBeNull();expect(el.textContent).toContain(item.body);
    expect([...el.querySelectorAll('button')].some(b=>b.textContent==='Sửa')).toBe(false);
    expect([...el.querySelectorAll('button')].some(b=>b.textContent==='Xóa')).toBe(false);
  });
  it('keeps draft and idempotency key on retry; successful pending save has an honest label',async()=>{
    const el=panel(),runtime=mockRuntime();mountComments(el,runtime);await flush();
    vi.mocked(runtime.api.createComment).mockRejectedValueOnce(new ApiError(503,'UNAVAILABLE','unavailable'));
    const body=el.querySelector('textarea')!;body.value='draft';
    el.querySelector('form')!.dispatchEvent(new Event('submit',{cancelable:true}));
    await vi.waitFor(()=>expect(el.querySelector('[data-comments-status]')!.textContent).toContain('Thử lại'));
    expect(body.value).toBe('draft');const first=vi.mocked(runtime.api.createComment).mock.calls[0]!;
    el.querySelector('form')!.dispatchEvent(new Event('submit',{cancelable:true}));
    await vi.waitFor(()=>expect(el.querySelector('[data-comments-status]')!.textContent).toContain('đang chờ'));
    expect(vi.mocked(runtime.api.createComment).mock.calls[1]![2]).toBe(first[2]);expect(body.value).toBe('');
  });
  it('logout clears private content and ignores a late authenticated read',async()=>{
    const el=panel(),runtime=mockRuntime();mountComments(el,runtime);await flush();
    let resolve!:(v:unknown)=>void;
    vi.mocked(runtime.api.comments).mockReturnValueOnce(new Promise(r=>{resolve=r;}) as never).mockResolvedValue({items:[],nextCursor:null});
    (el.querySelector('[data-comments-refresh]') as HTMLButtonElement).click();await vi.waitFor(()=>expect(runtime.api.comments).toHaveBeenCalledTimes(2));
    el.querySelector('textarea')!.value='private draft';runtime.setUser(null);resolve({items:[item],nextCursor:null});
    await vi.waitFor(()=>expect(el.querySelector('[data-comment-list]')!.children.length).toBe(0));expect(el.querySelector('textarea')!.value).toBe('');
  });
  it('owner queue waits for committed moderation and reports version conflict',async()=>{
    document.body.innerHTML='<section data-locale="vi"><p data-queue-status></p><button data-queue-refresh></button><div data-queue-list></div><button data-queue-more></button></section>';
    const el=document.querySelector('section')!,runtime=mockRuntime();runtime.setUser({id:'owner',role:'owner'});mountModerationQueue(el,runtime);
    await vi.waitFor(()=>expect(el.querySelector('.queue-item')).not.toBeNull());
    el.querySelector('input')!.value='reviewed';vi.mocked(runtime.api.moderate).mockRejectedValueOnce(new ApiError(409,'CONFLICT','changed'));
    (el.querySelector('.queue-item button') as HTMLButtonElement).click();await vi.waitFor(()=>expect(el.textContent).toContain('Phiên bản đã đổi'));expect(el.querySelector('.queue-item')).not.toBeNull();
    (el.querySelector('.queue-item button') as HTMLButtonElement).click();await vi.waitFor(()=>expect(el.querySelector('.queue-item')).toBeNull());
  });
});

it('offers owner deletion of a visitor comment with confirmation and the current version, without author editing',async()=>{
 const el=panel(),runtime=mockRuntime();runtime.setUser({id:'owner',role:'owner'});const stop=mountComments(el,runtime);await flush();
 expect([...el.querySelectorAll('button')].some(b=>b.textContent==='Sửa')).toBe(false);
 const remove=[...el.querySelectorAll('button')].find(b=>b.textContent==='Xóa')!;
 const previous=Object.getOwnPropertyDescriptor(window,'confirm');const confirm=vi.fn().mockReturnValueOnce(false).mockReturnValue(true);Object.defineProperty(window,'confirm',{configurable:true,value:confirm});
 remove.click();expect(runtime.api.deleteComment).not.toHaveBeenCalled();
 let finish!:(value:Comment)=>void;vi.mocked(runtime.api.deleteComment).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
 remove.click();remove.click();expect(runtime.api.deleteComment).toHaveBeenCalledTimes(1);expect(runtime.api.deleteComment).toHaveBeenCalledWith(item.id,item.version);
 finish(item);await vi.waitFor(()=>expect(el.textContent).toContain('Đã xóa bình luận.'));stop();if(previous)Object.defineProperty(window,'confirm',previous);else delete (window as any).confirm;
});

it('shows the guest composer without login and prompts only after an idempotent committed comment',async()=>{
 const el=panel(),runtime=mockRuntime();el.dataset.base='/hiens-nha/';runtime.setUser(null);
 const social=runtime as unknown as BackendRuntime;
 social.ensureSocialIdentity=vi.fn(async()=>runtime.setUser({id:'guest',role:'member',guest:true}));
 social.api.guestIdentity=vi.fn().mockResolvedValue({display_name:'Người Lạ',chosen:false});social.api.authProviders=vi.fn().mockResolvedValue({github:true,google:false,facebook:false});
 const committed={...item,id:'10000000-0000-0000-0000-000000000099',author_id:'guest',status:'approved' as const};vi.mocked(social.api.createComment).mockResolvedValue(committed);
 const show=vi.spyOn(HTMLDialogElement.prototype,'showModal').mockImplementation(function(this:HTMLDialogElement){this.open=true;});const close=vi.spyOn(HTMLDialogElement.prototype,'close').mockImplementation(function(this:HTMLDialogElement){this.open=false;});
 const stop=mountComments(el,social);await flush();expect(el.querySelector('form')!.hidden).toBe(false);expect(document.querySelector('[data-guest-identity]')).toBeNull();
 el.querySelector('textarea')!.value='First guest comment';el.querySelector('form')!.dispatchEvent(new Event('submit',{cancelable:true}));
 await vi.waitFor(()=>expect(document.querySelector('[data-guest-identity]')).not.toBeNull());expect(social.api.createComment).toHaveBeenCalledTimes(1);
 el.querySelector('form')!.dispatchEvent(new Event('submit',{cancelable:true}));expect(social.api.createComment).toHaveBeenCalledTimes(1);
 document.querySelector<HTMLInputElement>('[name="guest-name"]')!.value='Guest name';
 [...document.querySelectorAll<HTMLButtonElement>('[data-guest-identity] button')].find(b=>b.textContent==='OK')!.click();
 await vi.waitFor(()=>expect(document.querySelector('[data-guest-identity]')).toBeNull());expect(social.api.guestIdentity).toHaveBeenLastCalledWith('Guest name',true);expect(social.api.createComment).toHaveBeenCalledTimes(1);stop();show.mockRestore();close.mockRestore();
});
