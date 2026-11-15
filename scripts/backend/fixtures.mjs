import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { controls, changeControl } from './control-model.mjs';
const status = JSON.parse(
  await readFile('backend-test-results/stack.json', 'utf8'),
);
const url = status.API_URL ?? status.api_url;
const key = status.ANON_KEY ?? status.anon_key;
const adminKey = status.SERVICE_ROLE_KEY ?? status.service_role_key;
const database = status.DB_URL ?? status.db_url;
for (const value of [url, database])
  if (
    !value ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname)
  )
    throw new Error('Fixtures require loopback Supabase/DB');
if (!key || !adminKey) throw new Error('Local status is missing keys');
const admin = createClient(url, adminKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const sessions = {};
for (const name of ['A', 'B', 'owner']) {
  const email = `pilot-${name.toLowerCase()}-${crypto.randomUUID()}@example.test`,
    password = crypto.randomUUID() + 'Aa1!';
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'owner', user_name: 'sugia279' },
  });
  if (error || !created.user)
    throw new Error('Local fixture user creation failed');
  const auth = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await auth.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session)
    throw new Error('Local fixture Auth login failed');
  sessions[name] = signed.data.session;
}
const sql = postgres(database, { max: 1 });
try {
  await sql`insert into public.role_assignments(user_id,role) values(${sessions.owner.user.id},'owner')`;
  // Rehearse actual checked-in archives only in this isolated local DB, then compare public RLS output.
  const imported = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/migration/comments.mjs', '--apply'],
    { env: { ...process.env, LOCAL_DATABASE_URL: database }, encoding: 'utf8' },
  );
  if (imported.status !== 0)
    throw new Error(
      'Local import rehearsal failed: ' +
        imported.stderr.replaceAll(database, '[local-db]'),
    );
  console.log(imported.stdout);
  const rerun = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/migration/comments.mjs', '--apply'],
    { env: { ...process.env, LOCAL_DATABASE_URL: database }, encoding: 'utf8' },
  );
  if (rerun.status !== 0 || JSON.parse(rerun.stdout).changed !== 0)
    throw new Error('Local import rerun was not idempotent');
  console.log(
    'Local import rerun changed 0 records; shadow projection matches.',
  );
  const requestImport = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/migration/requests.mjs', '--apply'],
    { env: { ...process.env, LOCAL_DATABASE_URL: database }, encoding: 'utf8' },
  );
  if (requestImport.status !== 0)
    throw new Error('Legacy requests local rehearsal failed');
  console.log(requestImport.stdout);
  const requestRerun = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/migration/requests.mjs', '--apply'],
    { env: { ...process.env, LOCAL_DATABASE_URL: database }, encoding: 'utf8' },
  );
  if (
    requestRerun.status !== 0 ||
    JSON.parse(requestRerun.stdout).changed !== 0
  )
    throw new Error('Requests rerun was not idempotent');
  const pubImport = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/migration/publications.mjs', '--apply'],
    { env: { ...process.env, LOCAL_DATABASE_URL: database }, encoding: 'utf8' },
  );
  if (pubImport.status !== 0)
    throw new Error('Publications local import rehearsal failed');
  console.log(pubImport.stdout);
  const pubRerun = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/migration/publications.mjs', '--apply'],
    { env: { ...process.env, LOCAL_DATABASE_URL: database }, encoding: 'utf8' },
  );
  if (
    pubRerun.status !== 0 ||
    JSON.parse(pubRerun.stdout).some((r) => r.changed !== 0)
  )
    throw new Error('Publications rerun was not idempotent');
  const entity = (
    await sql`select id from public.content_entities where canonical_path='/hiens-nha/music/'`
  )[0];
  if (!entity) throw new Error('Music discussion entity was not registered');
  const controlDb = {
    query: async (q, args = []) => ({ rows: await sql.unsafe(q, args) }),
  };
  for (const state of await controls(controlDb))
    await changeControl(controlDb, {
      feature: state.feature,
      expected: state,
      next: { source: 'api', epoch: 1, writes_enabled: true },
      reason: 'Disposable local cutover rehearsal after shadow reconciliation',
    });
  const file = { url, key, entityId: entity.id, sessions };
  await writeFile('backend-test-results/sessions.json', JSON.stringify(file), {
    mode: 0o600,
  });
  for (let i = 0; i < 40; i++) {
    try {
      const response = await fetch(url + '/functions/v1/api/v1/health', {
        headers: { apikey: key },
      });
      if (response.ok) {
        console.log(
          'Local Auth fixtures and Edge API are ready. Session credentials remain in ignored private files.',
        );
        process.exitCode = 0;
        break;
      }
    } catch {}
    if (i === 39) throw new Error('Local Edge health timeout');
    await new Promise((r) => setTimeout(r, 1000));
  }
} finally {
  await sql.end();
}
