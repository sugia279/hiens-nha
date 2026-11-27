import { base as BASE, origin } from '../site-settings.mjs';
/**
 * Post-build artifact verification script.
 * Run via: npm run verify:build
 * Must be run AFTER npm run build.
 * Exits with code 1 on any failure.
 */

import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve(import.meta.dirname, '..', 'dist');
const errors: string[] = [];
const passes: string[] = [];

function check(condition: boolean, label: string): void {
  if (condition) passes.push(`PASS: ${label}`);
  else errors.push(`FAIL: ${label}`);
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(DIST, rel));
}

function readText(rel: string): string {
  try { return fs.readFileSync(path.join(DIST, rel), 'utf-8'); } catch { return ''; }
}

function containsBasePath(content: string): boolean {
  return content.includes(BASE);
}

// 1. dist/ must exist
if (!fs.existsSync(DIST)) {
  console.error('dist/ does not exist — run npm run build first');
  process.exit(1);
}

// 2. Required static routes
const requiredHtml = [
  'index.html',
  'about/index.html',
  '404.html',
  'articles/index.html',
  'notes/index.html',
  'projects/index.html',
  'series/index.html',
  'topics/index.html',
  'search/index.html',
  'graph/index.html',
];
for (const f of requiredHtml) {
  check(exists(f), `Route exists: ${f}`);
}

// 3. Graph manifest
check(exists('graph/graph.json'), 'Graph manifest exists');
const manifestText = readText('graph/graph.json');
let manifest: { schemaVersion?: number; nodes?: unknown[]; edges?: unknown[] } = {};
try {
  manifest = JSON.parse(manifestText) as typeof manifest;
  check(typeof manifest.schemaVersion === 'number', 'Graph manifest has schemaVersion');
  check(Array.isArray(manifest.nodes), 'Graph manifest has nodes array');
  check(Array.isArray(manifest.edges), 'Graph manifest has edges array');
  check(!manifestText.includes('draft-article'), 'Graph manifest excludes draft entries');
} catch {
  errors.push('FAIL: Graph manifest is not valid JSON');
}

// 4. Pagefind assets
check(exists('pagefind/pagefind.js'), 'Pagefind search index exists');

// 5. RSS feed
check(exists('rss.xml'), 'RSS feed exists');
const rssContent = readText('rss.xml');
check(rssContent.includes('<?xml'), 'RSS is valid XML');
check(rssContent.includes(origin), 'RSS uses the configured absolute origin');

// 6. Sitemap
const hasSitemap = exists('sitemap-index.xml') || exists('sitemap.xml');
check(hasSitemap, 'Sitemap exists');

// 7. Robots
check(exists('robots.txt'), 'robots.txt exists');

// 8. Resume served
check(exists('resume/SuDuyHien_Resume_Updated.html'), 'Resume served from public/');

// 9. Base path in key HTML files
for (const f of ['index.html', 'graph/index.html', 'search/index.html']) {
  if (exists(f)) {
    check(containsBasePath(readText(f)), `Base path in ${f}`);
  }
}

// 10. No root-relative href without base (basic check)
const homeHtml = readText('index.html');
const badLinks = [...homeHtml.matchAll(/href="(\/[^"]+)"/g)].filter((match) => !match[1]!.startsWith(BASE));
check(badLinks.length === 0, 'No root-relative links missing base path in home');

// Report
const total = passes.length + errors.length;
if (errors.length > 0) {
  console.error(`\nBuild verification FAILED: ${errors.length}/${total} checks failed.\n`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

console.log(`Build verification passed: ${passes.length}/${total} checks.\n`);
for (const p of passes) console.log(`  ${p}`);
