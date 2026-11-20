import type { TransitionBeforeSwapEvent } from 'astro:transitions/client';
import type { PageScope } from '../../lib/page-lifecycle';

/** Prepare incoming links before the new DOM becomes clickable, even before page-load. */
export function mountLocaleLinks(page: Pick<PageScope, 'signal'>) {
  function sync(root: ParentNode, current: URL) {
    for (const link of root.querySelectorAll<HTMLAnchorElement>('a[data-locale-link]')) {
      const target = new URL(link.getAttribute('href')!, current);
      target.search = current.search;
      target.hash = current.hash;
      link.href = target.href;
    }
  }
  sync(document, new URL(location.href));
  document.addEventListener('astro:before-swap', event => {
    const swap = event as TransitionBeforeSwapEvent;
    sync(swap.newDocument, swap.to);
  }, { signal: page.signal, capture: true });
}
