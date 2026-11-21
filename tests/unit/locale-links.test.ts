// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { mountLocaleLinks } from '../../src/components/site/locale-links';
import { onPageMount } from '../../src/lib/page-lifecycle';

it('preserves the destination query/hash before the incoming DOM is swapped and disposes the old handler', () => {
  const stop = onPageMount(page => mountLocaleLinks(page));
  document.dispatchEvent(new Event('DOMContentLoaded'));
  const incoming = document.implementation.createHTMLDocument();
  incoming.body.innerHTML = '<a data-locale-link href="/hiens-nha/photos/upload/">VI</a><a data-locale-link href="/hiens-nha/en/photos/upload/">EN</a><a href="/hiens-nha/">Home</a>';
  const to = new URL('https://example.test/hiens-nha/photos/upload/?album=cat-123#chosen');
  const swap = Object.assign(new Event('astro:before-swap'), { newDocument: incoming, to });
  try {
    document.dispatchEvent(swap);
    expect([...incoming.querySelectorAll('a[data-locale-link]')].map(a => a.getAttribute('href'))).toEqual([
      'https://example.test/hiens-nha/photos/upload/?album=cat-123#chosen',
      'https://example.test/hiens-nha/en/photos/upload/?album=cat-123#chosen',
    ]);
    expect(incoming.querySelector('a:not([data-locale-link])')?.getAttribute('href')).toBe('/hiens-nha/');
    incoming.querySelector('a')!.setAttribute('href', '/after-dispose/');
    document.dispatchEvent(Object.assign(new Event('astro:before-swap'), { newDocument: incoming, to }));
    expect(incoming.querySelector('a')?.getAttribute('href')).toBe('/after-dispose/');
  } finally { stop(); }
});
