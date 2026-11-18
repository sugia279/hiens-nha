import { expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const pm = require('picomatch');

it('resolves every toolchain consumer to the reviewed local fork', () => {
  for (const consumer of ['astro', 'vitest', 'tinyglobby', 'fdir', 'anymatch', '@astrojs/internal-helpers']) {
    const fromConsumer = createRequire(resolve('node_modules', consumer, 'package.json'));
    expect(fromConsumer('picomatch/package.json').name).toBe('@hiens-nha/picomatch-hardened');
    expect(fromConsumer('picomatch')).toBe(pm);
  }
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  for (const [path, entry] of Object.entries<any>(lock.packages)) {
    if (path.endsWith('/picomatch') && path.includes('node_modules/')) {
      expect(entry.link).not.toBe(true);
      expect(entry.resolved).toBe('file:vendor/picomatch');
    }
  }
});

it('literalizes wildcard repeat bodies before constructing a backtracking regex', () => {
  for (const pattern of ['+(*)', '+(*a)', '*(*a)', '+(*?a)', '+(*a|b)', '+((a+))']) {
    for (const options of [{}, { maxExtglobRecursion: false }]) {
      const result = spawnSync(process.execPath, ['-e', `const p=require('picomatch'); const pattern=${JSON.stringify(pattern)}; const options=${JSON.stringify(options)}; if(p.isMatch('a'.repeat(100)+'!',pattern,options))process.exit(2); if(!p.isMatch(pattern,pattern,options))process.exit(3);`], { cwd: process.cwd(), timeout: 1500 });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
    }
  }
});

it('preserves the ordinary, optional, brace and literal repeat patterns used by the toolchain', () => {
  for (const [path, pattern] of [
    ['src/content/a.mdx', '**/*{.md,.mdx}'],
    ['a.test.ts', '**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    ['a.spec.mtsx', '**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    ['aaab', '+(a|b)'], ['home/photo.webp', '**/*.{jpg,webp}'],
  ]) expect(pm.isMatch(path, pattern)).toBe(true);
  expect(pm.isMatch('a.txt', '**/*.ts')).toBe(false);
});
