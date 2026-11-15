/**
 * Lighthouse budget checker — proxy checks on built artifact.
 * Run via: npm run check:lighthouse
 * Must be run AFTER npm run build.
 *
 * Checks performance/SEO/accessibility budgets without requiring a browser:
 *  - JS bundle size < 600KB raw (proxy for performance)
 *  - CSS bundle size < 100KB raw
 *  - Every HTML page has <title>
 *  - Every HTML page has meta description
 *  - Every HTML page has canonical URL
 *  - Every HTML page has lang attribute
 *  - No pages missing viewport meta
 *  - robots.txt exists
 *  - sitemap exists
 */

import fs from 'node:fs';
import path from 'node:path';
import { routeAssets, routeBytes } from './lib/route-budgets.mjs';
import { base } from '../site-settings.mjs';

const distFlag = process.argv.indexOf('--dist');
const DIST = path.resolve(process.cwd(), distFlag >= 0 ? process.argv[distFlag + 1]! : 'dist');
const pilot = process.argv.includes('--pilot');
const errors: string[] = [];
const passes: string[] = [];
const warnings: string[] = [];

const JS_BUDGET_BYTES = 600_000;   // 600KB raw
const CSS_BUDGET_BYTES = 100_000;  // 100KB raw

if (!fs.existsSync(DIST)) {
  console.error('dist/ does not exist — run npm run build first');
  process.exit(1);
}

function check(condition: boolean, label: string, isWarning = false): void {
  if (condition) passes.push(`PASS: ${label}`);
  else if (isWarning) warnings.push(`WARN: ${label}`);
  else errors.push(`FAIL: ${label}`);
}

function readText(rel: string): string {
  try { return fs.readFileSync(path.join(DIST, rel), 'utf-8'); } catch { return ''; }
}

function findFiles(dir: string, ext: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const result: string[] = [];
  for (const entry of fs.readdirSync(dir, { recursive: true }) as string[]) {
    if (entry.endsWith(ext)) result.push(path.join(dir, entry));
  }
  return result;
}

// 1. Bundle size budgets
const astroDir = path.join(DIST, '_astro');
if (fs.existsSync(astroDir)) {
  let totalJsBytes = 0;
  let totalCssBytes = 0;
  for (const entry of fs.readdirSync(astroDir)) {
    const fullPath = path.join(astroDir, entry);
    const size = fs.statSync(fullPath).size;
    if (entry.endsWith('.js')) totalJsBytes += size;
    if (entry.endsWith('.css')) totalCssBytes += size;
  }
  const jsKb = Math.round(totalJsBytes / 1024);
  const cssKb = Math.round(totalCssBytes / 1024);
  console.log(`Emitted JS inventory: ${totalJsBytes} bytes; mode=${pilot ? 'pilot per-route' : 'default aggregate + per-route'}`);
  if (!pilot) check(totalJsBytes < JS_BUDGET_BYTES, `JS bundle ${jsKb}KB < ${JS_BUDGET_BYTES / 1024}KB budget`);
  check(totalCssBytes < CSS_BUDGET_BYTES, `CSS bundle ${cssKb}KB < ${CSS_BUDGET_BYTES / 1024}KB budget`);
}

const manifestPath = path.join(DIST, '.vite/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// 2. SEO requirements on every HTML page
const htmlFiles = findFiles(DIST, '.html').filter(
  (f) => !f.includes('resume') && !f.includes('pagefind'),
);

for (const file of htmlFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  const rel = path.relative(DIST, file);
  const sizes = routeBytes(routeAssets(content, manifest, base), (asset: string) => fs.statSync(path.join(DIST, asset)).size);
  check(sizes.js < JS_BUDGET_BYTES, `Route JS ${sizes.js} < ${JS_BUDGET_BYTES}: ${rel}`);
  check(sizes.css < CSS_BUDGET_BYTES, `Route CSS ${sizes.css} < ${CSS_BUDGET_BYTES}: ${rel}`);

  check(/<title>[^<]+<\/title>/i.test(content), `<title> present: ${rel}`);
  check(/<meta\s[^>]*name="description"/i.test(content), `meta description: ${rel}`);
  check(/<link\s[^>]*rel="canonical"/i.test(content), `canonical link: ${rel}`, true);
  check(content.includes(`lang="${rel.startsWith('en/') ? 'en' : 'vi'}"`), `Correct document language: ${rel}`);
  check(/name="viewport"/i.test(content), `viewport meta: ${rel}`);
}

// 3. Noindex on non-content pages
const searchHtml = readText('search/index.html');
check(
  searchHtml.includes('noindex'),
  'Search page has noindex robots',
);
const notFoundHtml = readText('404.html');
check(
  notFoundHtml.includes('noindex'),
  '404 page has noindex robots',
);

// 4. Accessibility indicator — iframe has title
const homeHtml = readText('resume/index.html');
check(/<iframe[^>]+title="[^"]+"/i.test(homeHtml), 'Resume iframe has title attribute on resume page');

// 5. Infrastructure
check(fs.existsSync(path.join(DIST, 'robots.txt')), 'robots.txt exists');
check(
  fs.existsSync(path.join(DIST, 'sitemap-index.xml')) || fs.existsSync(path.join(DIST, 'sitemap.xml')),
  'sitemap exists',
);

// ── Report ──
const total = passes.length + warnings.length + errors.length;

if (errors.length > 0) {
  console.error(`\nLighthouse budget check FAILED: ${errors.length} error(s), ${warnings.length} warning(s) / ${total} checks.\n`);
  for (const e of errors) console.error(`  ${e}`);
  for (const w of warnings) console.warn(`  ${w}`);
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn(`\nLighthouse budget check passed with ${warnings.length} warning(s) (${passes.length}/${total}).\n`);
  for (const p of passes) console.log(`  ${p}`);
  for (const w of warnings) console.warn(`  ${w}`);
} else {
  console.log(`Lighthouse budget check passed: ${passes.length}/${total} checks.\n`);
  for (const p of passes) console.log(`  ${p}`);
}
