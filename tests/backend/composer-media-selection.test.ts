// @vitest-environment happy-dom
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {mountSocialComposer} from '../../src/components/content/social-composer';
import {ImagePreparationError,preparePostImage} from '../../src/lib/api/prepare-post-image';
vi.mock('../../src/lib/api/prepare-post-image',async importOriginal=>({...await importOriginal<typeof import('../../src/lib/api/prepare-post-image')>(),preparePostImage:vi.fn()}));
const upload=vi.fn();vi.mock('../../src/lib/api/post-media',()=>({postMediaFor:()=>({upload}),preparePostVideo:vi.fn(async f=>f)}));
const owner={id:'10000000-0000-0000-0000-000000000003',role:'owner'};
let stop:()=>void;
beforeEach(()=>{vi.resetAllMocks();vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:fixture');vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 document.body.innerHTML=`<div data-social-composer data-locale="vi" data-epoch="1"><textarea data-home-thought></textarea><p data-composer-note></p><dialog data-status-dialog><button data-status-close></button><form><input name="people"><input name="location"><select name="feeling"><option value=""></option></select><textarea name="body">Text kept</textarea><select name="layout" data-status-layout><option value="auto" data-count="0">Auto</option></select><select name="frame"><option value="rounded">Rounded</option></select><p data-media-empty></p><div data-status-photos></div><button type="button" data-status-library>Library</button><input type="file" data-status-files><p data-status-message></p><span data-status-count></span><select name="visibility"><option value="hidden">Hidden</option></select><button type="submit">Save</button></form></dialog></div>`;
});
afterEach(()=>{stop?.();vi.restoreAllMocks();});
function setup(){const api={savePublication:vi.fn(),featureState:vi.fn()};stop=mountSocialComposer(document.querySelector('[data-social-composer]') as HTMLElement,{api,current:()=>({user:owner}),subscribe:(fn:(state:any)=>void)=>{fn({user:owner});return()=>{};}} as any);document.querySelector<HTMLTextAreaElement>('[name="body"]')!.value='Do not lose my media';return api;}
function select(){const input=document.querySelector<HTMLInputElement>('[data-status-files]')!;Object.defineProperty(input,'files',{configurable:true,value:[new File(['heic'],'IMG_001.HEIC',{type:'image/heic'})]});input.dispatchEvent(new Event('change',{bubbles:true}));}
it('shows a selection before conversion, blocks partial publishing and retries the same failed attachment',async()=>{
 const api=setup();let resolve!:(v:Blob)=>void;vi.mocked(preparePostImage).mockImplementationOnce(()=>new Promise(r=>resolve=r));select();
 expect(document.querySelectorAll('[data-status-photos] img')).toHaveLength(1);expect(document.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled).toBe(true);
 upload.mockRejectedValueOnce(Error('offline'));resolve(new Blob(['webp'],{type:'image/webp'}));
 await vi.waitFor(()=>expect(document.querySelector('.media-retry')).not.toBeNull());
 document.querySelector('form')!.dispatchEvent(new Event('submit',{cancelable:true}));expect(api.featureState).not.toHaveBeenCalled();expect(api.savePublication).not.toHaveBeenCalled();
 expect(document.querySelectorAll('[data-status-photos] img')).toHaveLength(1);
 vi.mocked(preparePostImage).mockResolvedValue(new Blob(['webp'],{type:'image/webp'}));upload.mockResolvedValue({resourceId:'primary-media',path:owner.id+'/20000000-0000-0000-0000-000000000001.webp',kind:'image'});
 (document.querySelector('.media-retry') as HTMLButtonElement).click();await vi.waitFor(()=>expect(document.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled).toBe(false));expect(upload).toHaveBeenCalledTimes(2);expect(document.querySelector('.media-retry')).toBeNull();
});
it('keeps undecodable HEIC visible and permits an intentional removal before text-only posting',async()=>{
 setup();vi.mocked(preparePostImage).mockRejectedValue(new ImagePreparationError('IMAGE_DECODE'));select();await vi.waitFor(()=>expect(document.querySelector('.media-state')?.textContent).toContain('HEIC'));
 expect(upload).not.toHaveBeenCalled();expect(document.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled).toBe(true);
 document.querySelector<HTMLButtonElement>('[aria-label="Bỏ ảnh 1"]')!.click();expect(document.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled).toBe(false);
});
