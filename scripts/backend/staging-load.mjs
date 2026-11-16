import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { stagingCredentials, stagingRef, stagingFetch } from './staging-target.mjs';
import { loadRecoveryCa, recoveryTlsOptions } from './recovery-ca.mjs';
import { postgresAdapter } from './postgres-adapter.mjs';
import { controls, changeControl } from './control-model.mjs';
import { runLoadWorkload } from './load-workload.mjs';

// No arbitrary target, local-guard bypass, production credential or runtime config inputs.
async function main() {
  const target = stagingCredentials(process.env, process.argv.slice(2));
  const ca = await loadRecoveryCa();
  await mkdir('backend-test-results', { recursive: true });
  const sql = postgres(target.database, { max: 1, connect_timeout: 15, idle_timeout: 10,
    connection: { statement_timeout: 15000 }, ssl: recoveryTlsOptions(target.host, ca.pem) });
  const db = postgresAdapter(sql);
  const admin = createClient(target.url, target.adminKey, { global: { fetch: stagingFetch }, auth: { persistSession: false, autoRefreshToken: false } });
  const result = { version: 1, createdAt: new Date().toISOString(), projectRef: stagingRef, profile: target.profile,
    productionTouched: false, hostedPerformanceGatePassed: false, globalIngressGatePassed: false,
    credentialsLogged: false, cleanup: false, freeze: false };
  let ownerId, entityId, workload, activated = false;
  try {
    // A partially cleaned run or real users requires explicit review, never broad deletion.
    const before = (await sql`select (select count(*) from auth.users)::int users,
      (select count(*) from public.profiles)::int profiles,
      (select count(*) from public.role_assignments)::int roles,
      (select count(*) from public.comments)::int comments,
      (select count(*) from private.publications)::int publications,
      (select count(*) from private.help_requests)::int requests`)[0];
    assert.ok(Object.values(before).every(n => n === 0), 'STAGING_NOT_EMPTY');
    const initial = await controls(db);
    assert.equal(initial.length, 4);
    assert.ok(initial.every(c => !c.writes_enabled && ((c.source === 'git' && c.epoch === 0) || (c.source === 'api' && c.epoch === 1))), 'STAGING_CONTROL_MISMATCH');
    const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    assert.ok(!list.error && list.data.users.length === 0, 'STAGING_ADMIN_VERIFICATION_FAILED');
    activated = true;
    const email = `staging-owner-${crypto.randomUUID()}@example.test`;
    const password = crypto.randomUUID() + 'Aa1!';
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ok(!created.error && created.data.user, 'STAGING_OWNER_CREATE_FAILED');
    ownerId = created.data.user.id;
    const client = createClient(target.url, target.key, { global: { fetch: stagingFetch }, auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await client.auth.signInWithPassword({ email, password });
    assert.ok(!signed.error && signed.data.session, 'STAGING_OWNER_LOGIN_FAILED');
    await sql`insert into public.role_assignments(user_id,role) values(${ownerId},'owner')`;
    entityId = (await sql`insert into public.content_entities(collection,legacy_key,canonical_path)
      values('page','staging-load-music','/hiens-nha/music/') returning id`)[0].id;
    for (const state of initial) await changeControl(db, { feature: state.feature, expected: state,
      next: { source: 'api', epoch: 1, writes_enabled: true }, reason: 'Approved isolated staging mixed-load fixture run' });
    workload = await runLoadWorkload({ sql, authFetch: stagingFetch, fixture: { url: target.url, key: target.key, entityId,
      sessions: { owner: signed.data.session } }, status: { SERVICE_ROLE_KEY: target.adminKey } },
      { profile: target.profile, hosted: true, closeDatabase: false, output: 'backend-test-results/staging-workload.json' });
    result.workloadPassed = workload.passed;
    result.workloadCleanup = workload.cleanup;
    result.measuredOperations = workload.stages.reduce((n,s) => n+s.completed, 0);
    // Even a full workload pass needs provider metrics, repeatability, Vietnam and ingress review.
  } finally {
    let cleanupFailed = false;
    try { if (activated) {
      for (const state of await controls(db)) if (state.writes_enabled)
        await changeControl(db, { feature: state.feature, expected: state,
          next: { source: state.source, epoch: state.epoch, writes_enabled: false }, reason: 'Isolated staging run finalizer freeze' });
      result.freeze = (await controls(db)).every(c => !c.writes_enabled);
    } } catch { cleanupFailed = true; }
    try { if (activated) {
      // Only this run's owner and entity; member cleanup belongs to the shared workload.
      if (ownerId) {
        await sql`delete from public.role_assignments where user_id=${ownerId}`;
        await sql`delete from private.feature_windows where actor_id=${ownerId}`;
        await sql`delete from private.write_windows where actor_id=${ownerId}`;
        await sql`delete from private.mutation_keys where actor_id=${ownerId}`;
        await sql`delete from private.feature_receipts where actor_id=${ownerId}`;
        await sql`delete from public.profiles where id=${ownerId}`;
        const deleted = await admin.auth.admin.deleteUser(ownerId);
        assert.ok(!deleted.error, 'STAGING_OWNER_CLEANUP_FAILED');
      }
      if (entityId) await sql`delete from public.content_entities where id=${entityId}`;
      const remaining = (await sql`select (select count(*) from auth.users)::int users,
        (select count(*) from public.comments)::int comments,
        (select count(*) from private.publications)::int publications,
        (select count(*) from private.help_requests)::int requests`)[0];
      result.cleanup = Object.values(remaining).every(n => n === 0) && !cleanupFailed;
    } } catch { result.cleanup = false; }
    await sql.end();
    result.passed = result.workloadPassed === true && result.workloadCleanup === true && result.cleanup && result.freeze;
    await writeFile('backend-test-results/staging-summary.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ stagingRun: result }));
  }
  if (!result.passed) process.exitCode = 1;
}
main().catch(() => { console.error('STAGING_RUN_FAILED; inspect numeric report; no raw credential/SQL/Auth error logged.'); process.exitCode = 1; });
