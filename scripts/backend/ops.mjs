import {postgresAdapter} from './postgres-adapter.mjs';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { localEnvironment } from './local-environment.mjs';
import { controls } from './control-model.mjs';
const env = await localEnvironment(),
  db = postgresAdapter(env.sql);
try {
  let cleaned = {};
  if (process.argv.includes('--prune-quota-windows')) {
    for (const table of ['write_windows', 'feature_windows']) {
      const result = await env.sql.unsafe(
        `delete from private.${table} where window_start<now()-interval '48 hours' returning 1`,
      );
      cleaned[table] = result.length;
    }
  }
  const state = await controls(db),
    counts = (
      await env.sql`select (select count(*)::int from public.comments where status='pending' and deleted_at is null) comments_pending,(select count(*)::int from private.publication_revisions r join private.publications p on p.id=r.publication_id and p.working_revision=r.revision where r.moderation='pending' and p.deleted_at is null) revisions_pending,(select count(*)::int from private.help_requests where moderation='pending' and deleted_at is null) requests_pending`
    )[0];
  const quotas =
    await env.sql`select 'comments' as feature,coalesce(max(w.count::float/case when r.role='owner' then 120 else 30 end),0) saturation from private.write_windows w left join public.role_assignments r on r.user_id=w.actor_id where w.window_start=date_trunc('minute',now()) union all select w.feature,coalesce(max(w.count::float/case when r.role='owner' then 120 else 30 end),0) from private.feature_windows w left join public.role_assignments r on r.user_id=w.actor_id where w.window_start=date_trunc('minute',now()) group by w.feature`;
  let backupAgeHours = null;
  try {
    backupAgeHours =
      (Date.now() -
        (await stat('backend-test-results/application-auth.backup')).mtimeMs) /
      3600000;
  } catch {}
  const alerts = [];
  if (backupAgeHours === null || backupAgeHours > 24)
    alerts.push(
      'Local backup missing or older than rehearsal RPO candidate 24h',
    );
  if (quotas.some((q) => q.saturation >= 0.8))
    alerts.push('Current mutation quota saturation >=80%');
  const load = await readFile(
    'backend-test-results/load-summary.json',
    'utf8',
  ).then(JSON.parse, () => null);
  if (load && !load.passed)
    alerts.push('Local load gate failed; inspect redacted summary');
  const report = {
    environment: 'loopback-only rehearsal',
    controls: state,
    pending: counts,
    quotas,
    backupAgeHours,
    cleaned,
    alerts,
  };
  await writeFile(
    'backend-test-results/ops-summary.json',
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await env.sql.end();
}
