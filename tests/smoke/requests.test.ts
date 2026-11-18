import { sourceFor, assertApiSource, commentsFrozen, assertFrozenComments, featureFrozen, assertFrozenFeature } from './source-contract';
import { expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
const html=(name:string)=>readFileSync(`dist/${name}`,'utf8');
it('builds bilingual request board/forms and keeps Guestbook separate',()=>{
 for(const prefix of ['', 'en/']) {
  const page=html(`${prefix}requests/index.html`);
  if (sourceFor('requests').source === 'api') {
    assertApiSource(page, 'requests');
    for(const id of ['request-board','send-request']) expect(page.match(new RegExp(`id="${id}"`,'g'))).toHaveLength(1);
  }
  else {
  for(const id of ['request-board','request-filter']) expect(page).toContain(`id="${id}"`);
  if(featureFrozen('requests')) assertFrozenFeature(page,'requests');
  else {
  for(const id of ['request-form','request-title','request-description','request-result','request-tags']) expect(page).toContain(`id="${id}"`);
  expect(page).toContain('data-repository="sugia279/hiens-nha"');
  expect(page).toContain(prefix?'A GitHub account is required':'Cần tài khoản GitHub');
  }
  }
  expect(page).toContain('docs/project/requests.md');
  expect(html(`${prefix}index.html`)).toContain('requests/');
  const guestbook = html(`${prefix}guestbook/index.html`);
  if (sourceFor('comments').source === 'api') assertApiSource(guestbook, 'comments');
  else if (commentsFrozen) assertFrozenComments(guestbook);
  else expect(guestbook).toContain('id="guestbook-form"');
  expect(html(`${prefix}index.html`)).toContain('data-nav-icon="Help shop"');
 }
});
it('keeps published request detail content and removes legacy update invitations during maintenance',()=>{
 if(sourceFor('requests').source!=='git'||!featureFrozen('requests'))return;
 const escaped=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 for(const file of readdirSync('data/requests').filter(f=>f.endsWith('.json'))){
  const item=JSON.parse(readFileSync(`data/requests/${file}`,'utf8'));
  if(!item.approved||item.deleted)continue;
  for(const prefix of ['','en/']){
   const page=html(`${prefix}requests/${item.number}/index.html`);
   assertFrozenFeature(page,'requests');
   expect(page).toContain(escaped(item.request.title));
   expect(page).toContain(escaped(item.request.description));
   expect(page).not.toContain('Discuss / add information on GitHub');
   expect(page).not.toContain('Thảo luận / bổ sung thông tin trên GitHub');
  }
 }
});
