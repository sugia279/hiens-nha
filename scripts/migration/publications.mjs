import {postgresAdapter} from '../backend/postgres-adapter.mjs';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { base } from '../../site-settings.mjs';
import {
  planPublicationsImport,
  applyPublicationsPlan,
  reconcilePublications,
} from './publications-model.mjs';
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  snapshotAt = execFileSync('git', ['show', '-s', '--format=%cI', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  reports = [];
for (const feature of ['posts', 'media']) {
  const dir = feature === 'posts' ? 'data/knowledge' : 'data/media';
  const archives = await Promise.all(
    (await readdir(dir))
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map(async (key) => ({
        key,
        raw: JSON.parse(await readFile(dir + '/' + key, 'utf8')),
      })),
  );
  const plan = planPublicationsImport({
    feature,
    archives,
    base,
    sourceCommit,
    snapshotAt,
  });
  let report = {
    feature,
    mode: 'dry-run',
    sourceCommit,
    records: plan.records.length,
    checksum: plan.checksum,
  };
  if (process.argv.includes('--apply') || process.argv.includes('--compare')) {
    const url = process.env.LOCAL_DATABASE_URL;
    if (
      !url ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)
    )
      throw new Error('Explicit loopback LOCAL_DATABASE_URL required');
    const { default: postgres } = await import('postgres');
    const sql = postgres(url, { max: 1 });
    const db = postgresAdapter(sql);
    try {
      if (process.argv.includes('--apply'))
        report = {
          ...report,
          mode: 'local-apply',
          ...(await applyPublicationsPlan(db, plan)),
        };
      report = { ...report, shadow: await reconcilePublications(db, plan) };
    } finally {
      await sql.end();
    }
  }
  reports.push(report);
}
console.log(JSON.stringify(reports, null, 2));
