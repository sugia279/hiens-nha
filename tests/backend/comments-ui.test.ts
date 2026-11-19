// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountComments } from '../../src/components/comments/controller';
import { mountModerationQueue } from '../../src/components/admin/moderation';
import type { BackendRuntime, AuthSnapshot } from '../../src/lib/auth/runtime';
import { ApiError, type Comment } from '../../supabase/functions/_shared/contracts';
const item: Comment = {id:'10000000-0000-0000-0000-000000000001',entity_id:'20000000-0000-0000-0000-000000000001',author_id:'a',parent_id:null,body:'<img src=x onerror=alert(1)>',status:'pending',version:1,created_at:'2026-11-14T00:00:00Z',updated_at:'2026-11-14T00:00:00Z',deleted_at:null};
function mockRuntime() {
  let snapshot:AuthSnapshot={user:{id:'a',role:'member'},busy:false,error:null}; const listeners=new Set<(s:AuthSnapshot)=>void>();
  const api={state:vi.fn().mockResolvedValue({source:'api',epoch:1,writes_enabled:true}),resolveEntity:vi.fn().mockResolvedValue({id:item.entity_id}),comments:vi.fn().mockResolvedValue({items:[item],nextCursor:null}),moderation:vi.fn().mockResolvedValue({items:[item],nextCursor:null}),createComment:vi.fn().mockResolvedValue(item),editComment:vi.fn().mockResolvedValue(item),deleteComment:vi.fn().mockResolvedValue(item),moderate:vi.fn().mockResolvedValue(item)};
  return {api,current:()=>snapshot,subscribe(fn:(s:AuthSnapshot)=>void){listeners.add(fn);fn(snapshot);return()=>listeners.delete(fn);}, setUser(user:AuthSnapshot['user']){snapshot={...snapshot,user};listeners.forEach(fn=>fn(snapshot));}} as unknown as Pick<BackendRuntime,'api'|'subscribe'|'current'> & {setUser(user:AuthSnapshot['user']):void};
}
function panel() {
  document.body.innerHTML='<section data-locale="vi" data-epoch="1" data-context="/hiens-nha/music/"><p data-comments-status></p><button data-comments-refresh></button><button data-comments-mine></button><form data-comment-form><p data-compose-context></p><textarea></textarea><button data-comment-save type="submit"></button><button data-compose-cancel type="button"></button></form><div data-comment-list></div><button data-comments-more></button></section>';
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
