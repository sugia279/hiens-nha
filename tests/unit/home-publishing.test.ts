// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { mountPublications } from '../../src/components/content/publications';
import { homeAuthorId } from '../../src/config/home-feed';
function setup(role: 'owner' | 'member', feed = false) {
 document.body.innerHTML = `<section data-mode="${feed ? 'list' : 'editor'}" data-owner-only="${!feed}" data-home-feed="${feed}" data-feature="posts" data-locale="vi" data-base="/hiens-nha/" data-epoch="1"><p data-feature-status></p><div data-feature-list></div><div data-publication-preview></div><button data-feature-more></button><button data-feature-refresh></button><button data-delete-publication></button><button data-publish-home></button>${feed ? '' : '<form data-publication-form>'+['title','body','kind','category','series','order','url','description','tags','mediaCategory'].map(n=>`<input name="${n}">`).join('')+'</form>'}</section>`;
 const row = { id:'post-1',entity_id:'post-1',author_id:homeAuthorId,feature:'posts',version:1,revision:1,status:'draft',payload:{title:'Bài của Hiển',body:'Nội dung riêng',kind:'poem',category:'Thơ',tags:['tho'],order:1,series:''} };
 const api = {featureState:vi.fn().mockResolvedValue({source:'api',epoch:1,writes_enabled:true}),publications:vi.fn().mockResolvedValue({items:feed ? [{...row,status:'approved'}, {...row,id:'legacy',author_id:null}]:[],nextCursor:null}),savePublication:vi.fn().mockResolvedValue(row),publicationHistory:vi.fn().mockResolvedValue({items:[],nextCursor:null}),publicationAction:vi.fn().mockImplementation(async (_f,_id,action)=>({...row,version:action==='submit'?2:3,status:action==='submit'?'pending':'approved'}))};
 const panel=document.querySelector<HTMLElement>('section')!;
 const user={id:homeAuthorId,role};
 const stop=mountPublications(panel,{api,current:()=>({user}),subscribe(fn:Function){fn({user});return ()=>{};}} as any);
 return {panel,api,stop};
}
it('does not reveal or submit the Home composer to members',async()=>{
 const {panel,api,stop}=setup('member');
 await vi.waitFor(()=>expect(api.featureState).toHaveBeenCalled());
 expect(panel.hidden).toBe(true);
 panel.querySelector<HTMLButtonElement>('[data-publish-home]')!.click();
 expect(api.savePublication).not.toHaveBeenCalled();expect(api.publicationAction).not.toHaveBeenCalled();stop();
});
it('saves privately then submits and approves the exact returned revision/version',async()=>{
 const {panel,api,stop}=setup('owner');
 await vi.waitFor(()=>expect(api.publications).toHaveBeenCalled());
 const form=panel.querySelector('form')!;
 for(const [name,value] of Object.entries({title:'Bài của Hiển',body:'Nội dung riêng',kind:'poem',category:'Thơ',tags:'tho',order:'1',series:''})) (form.elements.namedItem(name) as HTMLInputElement).value=value;
 panel.querySelector<HTMLButtonElement>('[data-publish-home]')!.click();
 await vi.waitFor(()=>expect(panel.textContent).toContain('Đã đăng bài công khai.'));
 expect(api.savePublication).toHaveBeenCalledTimes(1);
 expect(api.publicationAction.mock.calls[0]![2]).toBe('submit');
 expect(api.publicationAction.mock.calls[1]![3]).toMatchObject({expectedVersion:2,revision:1,decision:'approve'});
 stop();
});
it('shows only the configured owner author in the public Home feed',async()=>{
 const {panel,stop}=setup('member',true);
 await vi.waitFor(()=>expect(panel.querySelectorAll('.publication-card')).toHaveLength(1));
 expect(panel.querySelector('[data-publication-id="legacy"]')).toBeNull();
 expect(panel.textContent).toContain('Nội dung riêng');stop();
});
