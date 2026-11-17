import { expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, cpSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { acceptsLegacyFeature, legacyFeatureFrozen } from '../../src/lib/legacy-features.mjs';

const features = ['posts', 'media', 'requests'] as const;
const open = { version: 1, posts: false, media: false, requests: false };
const marker = (source: string) => ({ source, epoch: source === 'api' ? 1 : 0 });
const sources = { version: 1, posts: marker('git'), media: marker('git'), requests: marker('git') };

it('freezes each Git feature independently without reopening an API writer or freezing its neighbors', () => {
  for (let mask = 0; mask < 8; mask++) {
    const maintenance = { version: 1, posts: Boolean(mask & 1), media: Boolean(mask & 2), requests: Boolean(mask & 4) };
    for (const feature of features) {
      expect(acceptsLegacyFeature(sources, maintenance, feature)).toBe(!maintenance[feature]);
      expect(acceptsLegacyFeature({ ...sources, [feature]: marker('api') }, maintenance, feature)).toBe(false);
    }
  }
});

it('fails closed for incomplete, mistyped, unsupported or unknown maintenance/source markers', () => {
  for (const value of [null, {}, { ...open, version: 2 }, { version: 1, posts: false },
    { ...open, media: 'false' }, { ...open, requests: null }, { ...open, request: false }]) {
    expect(() => legacyFeatureFrozen(value, 'posts')).toThrow('maintenance marker');
    expect(() => acceptsLegacyFeature(sources, value, 'posts')).toThrow();
  }
  expect(() => legacyFeatureFrozen(open, 'comments')).toThrow();
  expect(() => acceptsLegacyFeature({ ...sources, version: 2 }, open, 'posts')).toThrow();
  expect(() => acceptsLegacyFeature({ ...sources, posts: { source: 'api', epoch: 0 } }, { ...open, posts: true }, 'posts')).toThrow();
});

it('actual frozen/API archive entrypoints exit before requiring an event, token or network', () => {
  const temp = mkdtempSync(join(tmpdir(), 'hiens-feature-freeze-'));
  try {
    mkdirSync(join(temp, 'config')); mkdirSync(join(temp, 'scripts'));
    for (const folder of ['src', 'supabase']) symlinkSync(resolve(folder), join(temp, folder), 'dir');
    const workers = { posts: 'archive-knowledge.mjs', media: 'archive-media.mjs', requests: 'archive-requests.mjs' };
    for (const worker of Object.values(workers)) cpSync(resolve('scripts', worker), join(temp, 'scripts', worker));
    const run = (feature: typeof features[number]) => spawnSync(process.execPath, [join(temp, 'scripts', workers[feature])], {
      encoding: 'utf8', timeout: 10000, env: { PATH: process.env.PATH, GITHUB_EVENT_PATH: join(temp, 'missing-event.json') },
    });
    for (const feature of features) {
      writeFileSync(join(temp, 'config/feature-sources.json'), JSON.stringify(sources));
      writeFileSync(join(temp, 'config/legacy-features.json'), JSON.stringify({ ...open, [feature]: true }));
      const frozen = run(feature); expect(frozen.status, frozen.stderr).toBe(0); expect(frozen.stdout).toContain('skipped');
      writeFileSync(join(temp, 'config/feature-sources.json'), JSON.stringify({ ...sources, [feature]: marker('api') }));
      writeFileSync(join(temp, 'config/legacy-features.json'), JSON.stringify(open));
      expect(run(feature).status).toBe(0);
      writeFileSync(join(temp, 'config/feature-sources.json'), JSON.stringify(sources));
      expect(run(feature).status).not.toBe(0); // Open Git really reaches the event boundary.
      writeFileSync(join(temp, 'config/legacy-features.json'), JSON.stringify({ ...open, [feature]: 'false' }));
      const invalid = run(feature); expect(invalid.status).not.toBe(0); expect(invalid.stderr).toContain('maintenance marker');
    }
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
