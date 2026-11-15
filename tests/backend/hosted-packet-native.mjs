import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import postgres from 'postgres';
import { localEnvironment } from '../../scripts/backend/local-environment.mjs';
import { postgresAdapter } from '../../scripts/backend/postgres-adapter.mjs';
import { initializeRehearsalSchema, rehearsalDatabase } from '../../scripts/migration/rehearsal-database.ts';
import { prepareHostedPacket, captureImportState, reconcileSnapshot } from '../../scripts/migration/hosted-packet-model.mjs';
import { packetSnapshot } from './helpers/packet-snapshot.mjs';

const env = await localEnvironment(), source = await rehearsalDatabase(), targets = [];
const owner = '10000000-0000-0000-0000-000000000003';
let stage = 'prepare', completed = false;
async function fresh() {
  const name = 'hn_packet_' + crypto.randomUUID().replaceAll('-', '');
  await env.sql.unsafe(`create database "${name}"`);
  const entry = { name, sql: null }; targets.push(entry);
  const url = new URL(env.database); url.pathname = '/' + name;
  const sql = postgres(url.href, { max: 1, onnotice: () => {} }); entry.sql = sql;
  const db = { ...postgresAdapter(sql), exec: text => sql.unsafe(text) };
  await initializeRehearsalSchema(db);
  await db.query('insert into auth.users values($1,\'{"role":"owner"}\')', [owner]);
  await db.query("insert into public.role_assignments(user_id,role) values($1,'owner')", [owner]);
  return { sql, db };
}
try {
  const snapshot = packetSnapshot(), packet = await prepareHostedPacket(source, snapshot, 'a'.repeat(20));
  const target = await fresh();
  stage = 'native-first-apply';
  await target.db.exec(packet.checkSql); await target.db.exec(packet.applySql);
  assert.deepEqual(await reconcileSnapshot(target.db, snapshot), packet.summary.shadow);
  const before = await captureImportState(target.db);
  stage = 'native-replay';
  await target.db.exec(packet.applySql); await target.db.exec(packet.shadowSql);
  assert.deepEqual(await captureImportState(target.db), before);
  assert.deepEqual((await target.db.query('select user_id,role from public.role_assignments')).rows, [{ user_id: owner, role: 'owner' }]);
  stage = 'native-drift-refusal';
  await target.db.query("update public.comments set body='Unexpected local delta' where id=$1", [snapshot.comments.records[0].id]);
  await assert.rejects(target.db.exec(packet.applySql), error => error.message.includes('Import state drift'));
  stage = 'native-atomic-rollback';
  const failure = await fresh(), baseline = await captureImportState(failure.db);
  await failure.db.exec("alter table private.help_requests add constraint local_failure check(status='new')");
  await assert.rejects(failure.db.exec(packet.applySql), error => error.code === '23514');
  assert.deepEqual(await captureImportState(failure.db), baseline);
  const report = { nativePostgres: true, firstApply: true, replay: true, shadow: packet.summary.shadow, ownerPreserved: true, driftRefused: true, atomicRollback: true, sqlBytes: Buffer.byteLength(packet.applySql), completed: true };
  await writeFile('backend-test-results/hosted-packet-summary.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report)); completed = true;
} catch (error) {
  console.error(JSON.stringify({ stage, code: /^[A-Z0-9]{5}$/.test(error.code ?? '') ? error.code : 'REHEARSAL_FAILED' }));
  process.exitCode = 1;
} finally {
  await source.close();
  for (const entry of targets.reverse()) {
    if (entry.sql) await entry.sql.end();
    await env.sql.unsafe(`drop database "${entry.name}" with (force)`);
  }
  await env.sql.end();
  if (!completed) process.exitCode = 1;
}
