import {postgresAdapter} from '../backend/postgres-adapter.mjs';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { base } from '../../site-settings.mjs';
import {
  planRequestsImport,
  applyRequestsPlan,
  reconcileRequests,
} from './requests-model.mjs';
const archives = await Promise.all(
  (await readdir('data/requests'))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map(async (f) => JSON.parse(await readFile('data/requests/' + f, 'utf8'))),
);
const plan = planRequestsImport({
  archives,
  base,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
});
let report = {
  mode: 'dry-run',
  sourceCommit: plan.sourceCommit,
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
        ...(await applyRequestsPlan(db, plan)),
      };
    report = { ...report, shadow: await reconcileRequests(db, plan) };
  } finally {
    await sql.end();
  }
}
console.log(JSON.stringify(report, null, 2));
