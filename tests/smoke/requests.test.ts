import { sourceFor, assertApiSource, commentsFrozen, assertFrozenComments } from './source-contract';
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const html=(name:string)=>readFileSync(`dist/${name}`,'utf8');
it('builds bilingual request board/forms and keeps Guestbook separate',()=>{
 for(const prefix of ['', 'en/']) {
  const page=html(`${prefix}requests/index.html`);
  if (sourceFor('requests').source === 'api') assertApiSource(page, 'requests');
  else {
  for(const id of ['request-board','request-filter','request-form','request-title','request-description','request-result','request-tags']) expect(page).toContain(`id="${id}"`);
  expect(page).toContain('data-repository="sugia279/hiens-nha"');
  expect(page).toContain(prefix?'A GitHub account is required':'Cần tài khoản GitHub');
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
