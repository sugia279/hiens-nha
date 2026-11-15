import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { base } from '../../site-settings.mjs';
import { planCommentsImport } from './comments-model.mjs';
import { planPublicationsImport } from './publications-model.mjs';
import { planRequestsImport } from './requests-model.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
async function walk(dir) {
  return (await Promise.all((await readdir(dir, { withFileTypes: true })).filter(e => !e.name.startsWith('.')).map(e => e.isDirectory() ? walk(resolve(dir, e.name)) : [resolve(dir, e.name)]))).flat();
}
async function archives(dir) {
  return Promise.all((await readdir(dir)).filter(f => f.endsWith('.json')).sort().map(async key => ({ key, raw: JSON.parse(await readFile(`${dir}/${key}`, 'utf8')) })));
}
export async function readImportSnapshot(sourceCommit = git('rev-parse', 'HEAD'), { dist = resolve('dist') } = {}) {
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('Exact source commit required');
  const scopes = ['data/guestbook', 'data/knowledge', 'data/media', 'data/requests', 'src', 'config', 'scripts/migration', 'supabase/migrations', 'supabase/functions/_shared/hosted-deployment.ts', 'astro.config.mjs', 'site-settings.mjs', 'package.json', 'package-lock.json'];
  if (git('diff', '--name-only', sourceCommit, '--', ...scopes) || git('ls-files', '--others', '--exclude-standard', '--', ...scopes)) throw new Error('Snapshot inputs differ from the reviewed source commit');
  const paths = [];
  for (const file of await walk(dist)) {
    if (!file.endsWith('.html')) continue;
    const logical = relative(dist, file).replaceAll('\\', '/'), html = await readFile(file, 'utf8');
    if (!html.includes('page-comments-heading') && !html.includes('data-api-comments') && !/^(en\/)?guestbook\/index.html$/.test(logical)) continue;
    if (logical === 'index.html') paths.push(base);
    else if (logical.endsWith('/index.html')) paths.push(base + logical.slice(0, -10));
  }
  if (!paths.length) throw new Error('Fresh built comment contexts required');
  const snapshotAt = git('show', '-s', '--format=%cI', sourceCommit);
  return {
    sourceCommit,
    comments: planCommentsImport({ paths: paths.sort(), archives: (await archives('data/guestbook')).map(r => r.raw), base, sourceCommit }),
    publications: await Promise.all(['posts', 'media'].map(async feature => planPublicationsImport({ feature, archives: await archives(feature === 'posts' ? 'data/knowledge' : 'data/media'), base, sourceCommit, snapshotAt }))),
    requests: planRequestsImport({ archives: (await archives('data/requests')).map(r => r.raw), base, sourceCommit }),
  };
}
