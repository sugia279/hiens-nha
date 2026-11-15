import { parse } from 'parse5';
/** Count Vite's complete reachable graph, including lazy imports, once per route. */
export function routeAssets(html, manifest, base) {
  const byFile = new Map(Object.entries(manifest).map(([key, chunk]) => [chunk.file, key]));
  const files = new Set(); const seen = new Set();
  function chunk(key) {
    if (seen.has(key)) return; seen.add(key);
    const entry = manifest[key]; if (!entry) throw new Error(`Missing manifest dependency: ${key}`);
    files.add(entry.file); for (const css of entry.css ?? []) files.add(css);
    for (const next of [...(entry.imports ?? []), ...(entry.dynamicImports ?? [])]) chunk(next);
  }
  function visit(node) {
    const attrs = Object.fromEntries((node.attrs ?? []).map(a => [a.name, a.value]));
    const value = node.tagName === 'script' ? attrs.src : node.tagName === 'link' && ['stylesheet', 'modulepreload'].includes(attrs.rel) ? attrs.href : null;
    if (value && value.startsWith(base)) {
      const file = decodeURIComponent(value.slice(base.length).split(/[?#]/)[0]);
      // Vite may emit names such as `_...hash.css`; only path segments traverse.
      if (file.startsWith('/') || file.includes('\\') || file.split('/').includes('..')) throw new Error('Asset traversal');
      const key = byFile.get(file);
      if (key) chunk(key);
      else if (file.endsWith('.js') || file.endsWith('.css')) {
        if (file.startsWith('_astro/') && file.endsWith('.js')) throw new Error(`Untracked Vite asset: ${file}`);
        files.add(file);
      }
    }
    for (const child of node.childNodes ?? []) visit(child);
  }
  visit(parse(html)); return files;
}
export function routeBytes(files, size) {
  let js = 0, css = 0;
  for (const file of files) { const bytes = size(file); if (file.endsWith('.js')) js += bytes; if (file.endsWith('.css')) css += bytes; }
  return { js, css };
}
