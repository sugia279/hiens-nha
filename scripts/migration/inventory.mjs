import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

// Explicit data scopes only: no repo-wide scan, no writes/import, no account claims.
const scopes = ['data/guestbook', 'data/knowledge', 'data/media', 'data/requests', 'src/content', 'src/data/photos'];
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.filter(e => !e.name.startsWith('.')).map(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))).flat().sort();
}
const report = { sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), scopes: [] };
for (const scope of scopes) {
  const files = [];
  for (const path of await walk(scope)) {
    const bytes = await readFile(path);
    const item = { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    if (scope.startsWith('data/') && path.endsWith('.json')) {
      const record = JSON.parse(bytes);
      Object.assign(item, { version: record.version ?? null, number: record.number ?? null, approved: record.approved === true, deleted: record.deleted === true });
    }
    files.push(item);
  }
  report.scopes.push({ path: scope, count: files.length, files });
}
console.log(JSON.stringify(report, null, 2));
