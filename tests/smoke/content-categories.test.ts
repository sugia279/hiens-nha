import {expect,it} from 'vitest';
import {Window} from 'happy-dom';
import {readFileSync} from 'node:fs';
it('renders the requested menu in both locales and keeps add inputs above their action rows',()=>{
 for(const prefix of ['','en/']){
  const document=new Window().document;document.body.innerHTML=readFileSync(`dist/${prefix}index.html`,'utf8');
  const nav=document.querySelector('.sidebar__desktop-nav .primary-nav__list')!;
  expect([...nav.children].map(node=>node.querySelector(':scope > a .nav-label')?.textContent)).toEqual(prefix?['Home','Photos','Video','Writing','About']:['Trang Chủ','Hình Ảnh','Video','Bài Viết','Về Hiển']);
  for(const scope of ['photos','media','posts']){
   const row=nav.querySelector(`[data-category-add="${scope}"]`)!;
   expect(row.firstElementChild?.matches('input[data-category-new][hidden]')).toBe(true);
   expect(row.querySelector('button[data-category-open]')).not.toBeNull();
  }
  expect(document.querySelectorAll('#sidebar [data-category-add]')).toHaveLength(6);
  expect(document.querySelectorAll('[data-social-composer] [data-taxonomy-input]')).toHaveLength(2);
  for(const route of ['photos/upload/','account/content/']){
   const upload=new Window().document;upload.body.innerHTML=readFileSync(`dist/${prefix}${route}index.html`,'utf8');
   expect(upload.querySelector('input[data-taxonomy-input][list]')).not.toBeNull();
  }
 }
});
