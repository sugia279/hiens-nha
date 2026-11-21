// @vitest-environment happy-dom
import {beforeEach,expect,it,vi} from 'vitest';
import {mountContentCategories} from '../../src/components/site/content-categories';
import {mountPhotoCategories} from '../../src/components/photos/categories';
import {categoryCatalogue} from '../../src/lib/category-catalogue';
import {mountCategoryPickers} from '../../src/components/content/category-pickers';
import type {BackendRuntime} from '../../src/lib/auth/runtime';
import {defaultCategories} from '../../src/lib/content-categories';
function setup(){
 const seeds=defaultCategories.filter(c=>c.scope==='photos').map(c=>`<li data-category-id="${c.id}">${c.label}</li>`).join('');
 document.body.innerHTML=[0,1].map(()=>'<ul data-category-scope="photos">'+seeds+'<li><div data-category-add="photos"><input data-category-new hidden><button data-category-open>Add</button><p data-category-status></p></div></li></ul>').join('')+'<div class="category-picker"><input name="album" data-taxonomy-input="photos" list="options"><datalist id="options" data-taxonomy-options="photos"></datalist><p data-category-feedback></p></div>';
 const api={contentCategories:vi.fn().mockResolvedValue([...defaultCategories]),createContentCategory:vi.fn().mockImplementation(async(scope,label)=>({id:'cat-10000000-0000-0000-0000-000000000001',scope,label,label_en:null}))};
 const runtime={api,current:()=>({user:{id:'member',role:'member'},busy:false}),signIn:vi.fn(),subscribe:vi.fn()} as unknown as Pick<BackendRuntime,'api'|'current'|'subscribe'|'signIn'>;
 const stopMenu=mountContentCategories(document,runtime,true),stopPickers=mountCategoryPickers(document,runtime,true);
 const stop=()=>{stopMenu();stopPickers();};
 return{api,runtime,stop,input:document.querySelector<HTMLInputElement>('[data-category-new]')!,opener:document.querySelector<HTMLButtonElement>('[data-category-open]')!};
}
beforeEach(()=>{document.body.innerHTML='';});
it('opens above the add button and saves Enter plus blur only once, updating both menus and comboboxes',async()=>{
 const{api,stop,input,opener}=setup();opener.click();expect(input.hidden).toBe(false);expect(document.activeElement).toBe(input);
 expect(input.compareDocumentPosition(opener)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 input.value='Du lịch';input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));input.dispatchEvent(new Event('blur'));
 await vi.waitFor(()=>expect(document.querySelectorAll('.nav-category-dynamic')).toHaveLength(2));
 expect(api.createContentCategory).toHaveBeenCalledTimes(1);expect(input.hidden).toBe(true);
 expect([...document.querySelectorAll('datalist option')].map(o=>(o as HTMLOptionElement).value)).toContain('Du lịch');
 const combo=document.querySelector<HTMLInputElement>('[data-taxonomy-input]')!;combo.value='Du lịch';combo.dispatchEvent(new Event('blur'));
 await Promise.resolve();expect(api.createContentCategory).toHaveBeenCalledTimes(1);
 stop();opener.click();expect(input.hidden).toBe(true);
});
it('commits nonempty blur as literal text; blank, Escape and IME Enter never create categories',async()=>{
 const{api,stop,input,opener}=setup();opener.click();input.value='   ';input.dispatchEvent(new Event('blur'));expect(api.createContentCategory).not.toHaveBeenCalled();
 opener.click();input.value='Cancel';input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));input.dispatchEvent(new Event('blur'));expect(api.createContentCategory).not.toHaveBeenCalled();
 opener.click();input.value='Typing';input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true}));expect(api.createContentCategory).not.toHaveBeenCalled();
 input.value='<img src=x>';input.dispatchEvent(new Event('blur'));await vi.waitFor(()=>expect(document.querySelectorAll('.nav-category-dynamic')).toHaveLength(2));
 expect(document.querySelector('.nav-category-dynamic img')).toBeNull();expect(document.querySelector('.nav-category-dynamic')?.textContent).toContain('<img src=x>');stop();
});
it('retains failed input for retry and never inserts an unsaved category',async()=>{
 const{api,stop,input,opener}=setup();api.createContentCategory.mockRejectedValueOnce(new Error('offline'));
 opener.click();input.value='Keep me';input.dispatchEvent(new Event('blur'));
 await vi.waitFor(()=>expect(document.querySelector('[data-category-status]')?.textContent).toContain('Chưa lưu'));
 expect(input.value).toBe('Keep me');expect(input.hidden).toBe(false);expect(document.querySelector('.nav-category-dynamic')).toBeNull();
 input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));await vi.waitFor(()=>expect(document.querySelectorAll('.nav-category-dynamic')).toHaveLength(2));expect(api.createContentCategory).toHaveBeenCalledTimes(2);stop();
});

it('mounts gallery albums from the shared catalogue, filters a selected album and disposes its subscription',async()=>{
 const {runtime,stop}=setup();
 const id='cat-10000000-0000-0000-0000-000000000001';
 const previous=location.href;
 history.replaceState(null,'',`?album=${id}#${id}`);
 document.body.insertAdjacentHTML('beforeend','<div data-photo-gallery><header class="photos-header"><a href="/hiens-nha/photos/upload/">Upload</a></header><nav class="album-links"></nav><section data-album-id="family"><h2>Family</h2></section></div>');
 const dispose=mountPhotoCategories(document,runtime,true),catalogue=categoryCatalogue(runtime);
 try {
  await catalogue.ensure('photos','<img src=x>');
  const gallery=document.querySelector<HTMLElement>('[data-photo-gallery]')!;
  const album=gallery.querySelector<HTMLElement>(`[data-album-id="${id}"]`)!;
  expect(album.hidden).toBe(false);expect(album.querySelector('h2')?.textContent).toBe('<img src=x>');
  expect(album.querySelector('img')).toBeNull();expect(album.getAttribute('aria-labelledby')).toBe(id);
  expect(gallery.querySelector<HTMLElement>('[data-album-id="family"]')?.hidden).toBe(true);
  expect(gallery.querySelector<HTMLAnchorElement>('.photos-header a')?.pathname).toBe('/hiens-nha/photos/upload/');
  expect(gallery.querySelector<HTMLAnchorElement>('.photos-header a')?.search).toBe(`?album=${id}`);
  await catalogue.refresh();expect(gallery.querySelectorAll(`[data-album-id="${id}"]`)).toHaveLength(1);
  expect(gallery.querySelectorAll(`.album-links a[href*="${id}"]`)).toHaveLength(1);
  dispose();gallery.replaceChildren();await catalogue.refresh();expect(gallery.children).toHaveLength(0);
  const disposeEn=mountPhotoCategories(document,runtime,false);
  expect(gallery.querySelector(`[data-album-id="${id}"] h2`)?.textContent).toBe('<img src=x>');
  expect(gallery.querySelector<HTMLAnchorElement>(`[data-album-id="${id}"] a`)?.pathname).toBe('/hiens-nha/en/photos/upload/');
  disposeEn();
 } finally {dispose();stop();history.replaceState(null,'',previous);}
});
