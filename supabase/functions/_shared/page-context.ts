/** Canonical discussion identity, independent of browser, Astro and provider SDK. */
export function canonicalPageContext(value: string, base: string, origin = 'https://site.invalid'): string | undefined {
  if (!base.startsWith('/') || !base.endsWith('/') || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return undefined;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || !url.pathname.startsWith(base)) return undefined;
    const relative = url.pathname.slice(base.length).replace(/^en(?:\/|$)/, '');
    const path = decodeURIComponent(base + relative).normalize('NFC');
    if (/[?#\\\r\n]/.test(path) || path.includes('//')) return undefined;
    return path.replace(/\/+$/, '') + '/';
  } catch { return undefined; }
}
