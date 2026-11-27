// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PageScope } from '../../src/lib/page-lifecycle';
const mount = vi.hoisted(() => ({
  fn: null as null | ((page: PageScope) => void),
}));
vi.mock('../../src/lib/page-lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/page-lifecycle')>()),
  onPageMount: (fn: (page: PageScope) => void) => {
    mount.fn = fn;
  },
}));
import '../../src/components/photos/photo-viewer';
let scope: PageScope;
beforeEach(() => {
  document.body.innerHTML =
    '<input id="search"><a data-photo-full="https://images.example/photo.webp" data-profile-photo="true" href="#">Photo</a><dialog id="photo-viewer"><h2 id="photo-viewer-title"></h2><img id="photo-viewer-image"><button id="photo-size"></button><div id="photo-stage"></div><p id="photo-viewer-description"></p></dialog>';
  scope = new PageScope();
  mount.fn!(scope);
  document.querySelector<HTMLAnchorElement>('a')!.click();
});
afterEach(() => {
  scope.dispose();
  document.body.replaceChildren();
});
it('does not steal focus from search when a delayed viewer close event arrives', () => {
  const viewer = document.querySelector<HTMLDialogElement>('dialog')!,
    search = document.querySelector<HTMLInputElement>('input')!;
  viewer.open = false;
  search.focus();
  viewer.dispatchEvent(new Event('close'));
  expect(document.activeElement).toBe(search);
});
it('restores photo focus when it remains inside the closing viewer', () => {
  const viewer = document.querySelector<HTMLDialogElement>('dialog')!;
  document.querySelector<HTMLButtonElement>('button')!.focus();
  viewer.open = false;
  viewer.dispatchEvent(new Event('close'));
  expect(document.activeElement).toBe(document.querySelector('a'));
});
