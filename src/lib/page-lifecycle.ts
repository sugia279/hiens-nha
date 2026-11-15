/** Mount once per document; release page-owned state before Astro replaces its DOM. */
export class PageScope {
  readonly controller = new AbortController();
  readonly signal = this.controller.signal;
  private disposers: (() => void)[] = [];
  cleanup(dispose: () => void) { if (this.signal.aborted) dispose(); else this.disposers.push(dispose); }
  listen<K extends keyof WindowEventMap>(target: Window, type: K, listener: (event: WindowEventMap[K]) => void): void;
  listen<K extends keyof DocumentEventMap>(target: Document, type: K, listener: (event: DocumentEventMap[K]) => void): void;
  listen(target: EventTarget, type: string, listener: (event: any) => void): void {
    target.addEventListener(type, listener, { signal: this.signal });
  }
  dispose() { this.controller.abort(); for (const fn of this.disposers.splice(0).reverse()) fn(); }
}
export function onPageMount(mount: (page: PageScope) => void) {
  let body: HTMLElement | null = null, scope: PageScope | null = null;
  const stop = () => { scope?.dispose(); scope = null; body = null; };
  const start = () => {
    if (!document.body || body === document.body) return;
    stop(); body = document.body; scope = new PageScope(); mount(scope);
  };
  document.addEventListener('astro:before-swap', stop);
  document.addEventListener('astro:page-load', start);
  window.addEventListener('pagehide', stop);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  return () => {
    stop(); document.removeEventListener('astro:before-swap', stop);
    document.removeEventListener('astro:page-load', start);
    document.removeEventListener('DOMContentLoaded', start);
    window.removeEventListener('pagehide', stop);
  };
}
