import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { base } from '../../site-settings.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function artifact(enabled: boolean) {
  const root = mkdtempSync(path.join(tmpdir(), 'hiens-budget-')); roots.push(root);
  function put(file: string, content: string) { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), content); }
  const html = `<html lang="vi" data-backend-enabled="${enabled}"><head><title>Budget fixture</title><meta name="description" content="Fixture"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><link rel="canonical" href="https://example.test/"></head><body><script src="${base}_astro/entry.js"></script></body></html>`;
  for (const file of ['index.html', '404.html', 'search/index.html']) put(file, html);
  put('resume/index.html', '<iframe title="Resume"></iframe>'); put('robots.txt', ''); put('sitemap.xml', '<urlset/>');
  put('_astro/entry.js', ' '.repeat(100000)); put('_astro/other-route.js', ' '.repeat(600000));
  put('.vite/manifest.json', JSON.stringify({ entry: { file: '_astro/entry.js' } }));
  return { root, put };
}
function check(root: string, ...args: string[]) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/check-lighthouse.ts', '--dist', root, ...args], { encoding: 'utf8', timeout: 15000 });
  return { status: result.status, output: result.stdout + result.stderr };
}
it('retains the disabled aggregate gate and rejects a pilot flag bypass', () => {
  const { root } = artifact(false);
  const normal = check(root); expect(normal.status).toBe(1); expect(normal.output).toContain('FAIL: JS bundle');
  const pilot = check(root, '--pilot'); expect(pilot.status).not.toBe(0); expect(pilot.output).toContain('Pilot budget requires');
});
it('allows separate backend route bundles but still rejects oversized lazy JS, CSS and inconsistent markers', () => {
  const { root, put } = artifact(true);
  expect(check(root).status).toBe(0);
  put('.vite/manifest.json', JSON.stringify({ entry: { file: '_astro/entry.js', dynamicImports: ['auth'] }, auth: { file: '_astro/auth.js' } }));
  put('_astro/auth.js', ' '.repeat(650000));
  const lazy = check(root); expect(lazy.status).toBe(1); expect(lazy.output).toContain('FAIL: Route JS 750000');
  put('.vite/manifest.json', JSON.stringify({ entry: { file: '_astro/entry.js' } }));
  put('_astro/oversized.css', ' '.repeat(100001));
  const css = check(root); expect(css.status).toBe(1); expect(css.output).toContain('FAIL: CSS bundle');
  put('_astro/oversized.css', '');
  put('404.html', '<html lang="vi" data-backend-enabled="false"></html>');
  const mixed = check(root); expect(mixed.status).toBe(1); expect(mixed.output).toContain('FAIL: Backend marker matches build: 404.html');
});
