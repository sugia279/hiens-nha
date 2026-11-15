// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { onPageMount } from '../../src/lib/page-lifecycle';
it('mounts once per document and disposes subscriptions/listeners before replacing a page', () => {
  const counts = { mount: 0, dispose: 0, click: 0 };
  const off = onPageMount(page => {
    counts.mount++;
    page.listen(document, 'click', () => counts.click++);
    page.cleanup(() => counts.dispose++);
  });
  document.dispatchEvent(new Event('DOMContentLoaded'));
  document.dispatchEvent(new Event('astro:page-load'));
  document.dispatchEvent(new MouseEvent('click'));
  expect(counts).toEqual({ mount: 1, dispose: 0, click: 1 });
  document.dispatchEvent(new Event('astro:before-swap'));
  document.dispatchEvent(new MouseEvent('click'));
  expect(counts.click).toBe(1);
  document.body.replaceWith(document.createElement('body'));
  document.dispatchEvent(new Event('astro:page-load'));
  document.dispatchEvent(new Event('astro:page-load'));
  document.dispatchEvent(new MouseEvent('click'));
  expect(counts).toEqual({ mount: 2, dispose: 1, click: 2 });
  window.dispatchEvent(new Event('pagehide'));
  expect(counts.dispose).toBe(2);
  off();
});
