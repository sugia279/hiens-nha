import {postgresAdapter} from './postgres-adapter.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import { localEnvironment } from './local-environment.mjs';
import { controls, changeControl } from './control-model.mjs';
import { checksum } from '../migration/comments-model.mjs';
const env = await localEnvironment(),
  db = postgresAdapter(env.sql);
const name = 'hn_restore_' + crypto.randomUUID().replaceAll('-', '');
const project = (await readFile('supabase/config.toml', 'utf8')).match(
  /^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m,
)?.[1];
if (!project) throw new Error('Local project identifier required');
const container = 'supabase_db_' + project;
const run = (args, input) => {
  const r = spawnSync('docker', ['exec', '-i', container, ...args], {
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    const errors = r.stderr
      .toString()
      .split('\n')
      .filter((l) => /^pg_(?:dump|restore): error:/.test(l))
      .map((l) => l.slice(0, 250))
      .slice(0, 4);
    throw new Error(
      'Local dump/restore command failed (' +
        args[0] +
        '): ' +
        errors.join('; '),
    );
  }
  return r.stdout;
};
async function digest(sql) {
  const tables =
    await sql`select table_schema,table_name from information_schema.tables where table_type='BASE TABLE' and table_schema in ('public','private','auth') order by 1,2`;
  const records = [];
  for (const t of tables) {
    const rows = await sql.unsafe(
      `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') as data from "${t.table_schema}"."${t.table_name}" t`,
    );
    records.push({
      table: t.table_schema + '.' + t.table_name,
      count: rows[0].data.length,
      checksum: checksum(rows[0].data),
    });
  }
  return records;
}
const previous = await controls(db);
let target;
let created = false;
try {
  // Acquire a real mutation's SHARE lock and prove maintenance cannot pass until commit.
  const writer = postgres(env.database, { max: 1 });
  const holder = await writer.reserve();
  await holder.unsafe('begin');
  await holder.unsafe("select set_config('request.jwt.claim.sub',$1,true)", [
    env.fixture.sessions.A.user.id,
  ]);
  await holder.unsafe('set local role authenticated');
  await holder.unsafe(
    "select public.publication_write(p_feature=>'posts',p_action=>'create',p_payload=>$1::jsonb,p_key=>$2)",
    [
      ({
        title: 'Restore lock fixture',
        body: 'Committed before maintenance snapshot',
        kind: 'note',
        category: 'Ops',
        tags: ['ops'],
        series: '',
        order: 1,
      }),
      crypto.randomUUID(),
    ],
  );
  let frozen = false;
  const state = previous.find((s) => s.feature === 'posts');
  const freeze = changeControl(db, {
    feature: 'posts',
    expected: state,
    next: { source: state.source, epoch: state.epoch, writes_enabled: false },
    reason: 'Backup rehearsal freeze',
  }).then(() => {
    frozen = true;
  });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(frozen, false, 'maintenance must wait for admitted transaction');
  await holder.unsafe('commit');
  holder.release();
  await writer.end();
  await freeze;
  for (const state of previous.filter((s) => s.feature !== 'posts'))
    await changeControl(db, {
      feature: state.feature,
      expected: state,
      next: { source: state.source, epoch: state.epoch, writes_enabled: false },
      reason: 'Backup rehearsal freeze',
    });
  const before = await digest(env.sql),
    started = performance.now();
  const bytes = run([
    'pg_dump',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '--format=custom',
    '--no-owner',
    '--schema=public',
    '--schema=private',
    '--schema=auth',
  ]);
  const dumpPath = 'backend-test-results/application-auth.backup';
  await writeFile(dumpPath, bytes, { mode: 0o600 });
  await chmod(dumpPath, 0o600);
  await env.sql.unsafe(`create database "${name}"`);
  created = true;
  const targetUrl = new URL(env.database);
  targetUrl.pathname = '/' + name;
  target = postgres(targetUrl.href, { max: 1 });
  await target.unsafe(
    'drop schema public cascade;create schema if not exists extensions;create extension if not exists pgcrypto with schema extensions;create extension if not exists "uuid-ossp" with schema extensions',
  );
  run(
    [
      'pg_restore',
      '-U',
      'postgres',
      '-d',
      name,
      '--no-owner',
            '--single-transaction',
      '--exit-on-error',
    ],
    bytes,
  );
  assert.equal(
    checksum(await digest(target)),
    checksum(before),
    'all application/Auth table counts and checksums must restore exactly',
  );
  await target.begin(async (tx) => {
    await tx.unsafe('set local role anon');
    assert.ok((await tx`select id from public.content_entities`).length > 0);
    await assert.rejects(
      tx.unsafe('select * from private.feature_receipts'),
      (e) => e.code === '42501',
    );
  });
  // An aborted negative check ends only its own transaction; the restored DB remains usable.
  await target.begin(async (tx) => {
    await tx.unsafe('set local role authenticated');
    await tx.unsafe("select set_config('request.jwt.claim.sub',$1,true)", [
      env.fixture.sessions.A.user.id,
    ]);
    await assert.rejects(
      tx.unsafe(
        "select public.publication_write(p_feature=>'posts',p_action=>'create',p_payload=>'{}',p_key=>$1)",
        [crypto.randomUUID()],
      ),
      (e) => e.code === 'PT503',
    );
  });
  const report = {
    scope: 'local application + Auth schemas; existing cluster roles',
    tables: before.length,
    rows: before.reduce((n, t) => n + t.count, 0),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    restoreMilliseconds: Math.round(performance.now() - started),
    checksumsMatch: true,
    rlsDenied: true,
    restoredWritesDisabled: true,
    maintenanceWaitedForWriter: true,
  };
  await writeFile(
    'backend-test-results/restore-summary.json',
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  if (target) await target.end();
  if (created) await env.sql.unsafe(`drop database "${name}" with (force)`);
  const current = await controls(db);
  for (const state of previous) {
    const now = current.find((s) => s.feature === state.feature);
    if (now.writes_enabled !== state.writes_enabled)
      await changeControl(db, {
        feature: state.feature,
        expected: now,
        next: {
          source: state.source,
          epoch: state.epoch,
          writes_enabled: state.writes_enabled,
        },
        reason: 'End disposable restore rehearsal',
      });
  }
  await env.sql.end();
}
