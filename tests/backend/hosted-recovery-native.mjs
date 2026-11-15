import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { controls } from '../../scripts/backend/control-model.mjs';
import { postgresAdapter } from '../../scripts/backend/postgres-adapter.mjs';
import { localEnvironment } from '../../scripts/backend/local-environment.mjs';
import { recoverySchemas } from '../../scripts/backend/hosted-recovery-model.mjs';
import { recoveryTarget, rehearseSnapshot, privateCommand, encryptDump, fileSha256 } from '../../scripts/backend/hosted-recovery-engine.mjs';
const env = await localEnvironment(), target = await recoveryTarget();
const source = postgres(env.database, { max: 1, onnotice: () => {} });
const directory = await mkdtemp(resolve('backend-test-results/native-recovery-'));
const eventId = crypto.randomUUID();
const originalControls = await controls(postgresAdapter(env.sql));
let stage = 'native-snapshot', complete = false;
try {
  const raw = resolve(directory, 'source.backup');
  const report = await rehearseSnapshot({ source, target, rawPath: raw,
    afterSnapshot: async () => { await env.sql.unsafe("insert into private.control_events(id,feature,previous,next,reason) values($1,'posts','{}','{}','Disposable snapshot concurrency fixture')", [eventId]); },
    dump: async (snapshot, path) => { await privateCommand('docker', ['exec', '-i', target.container, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--format=custom', '--snapshot=' + snapshot, ...recoverySchemas.map(s => '--schema=' + s)], { outputFile: path, limit: 16 * 1024 * 1024 }); },
  });
  assert.equal((await env.sql.unsafe('select count(*)::int n from private.control_events where id=$1', [eventId]))[0].n, 1);
  assert.deepEqual(await controls(postgresAdapter(env.sql)), originalControls);
  stage = 'native-age-roundtrip';
  const key = resolve(directory, 'test-identity.agekey');
  await privateCommand('age-keygen', ['-o', key]);
  const recipient = (await privateCommand('age-keygen', ['-y', key])).toString().trim();
  const encrypted = resolve(directory, 'source.backup.age');
  const cipher = await encryptDump(raw, recipient, encrypted);
  const decrypted = resolve(directory, 'decrypted.backup');
  await privateCommand('age', ['--decrypt', '--identity', key, encrypted], { outputFile: decrypted, limit: 16 * 1024 * 1024 });
  assert.equal(await fileSha256(decrypted), report.dumpSha256);
  for (const path of [raw, key, encrypted, decrypted]) assert.equal((await stat(path)).mode & 0o777, 0o600);
  stage = 'native-tamper-refusal';
  const bytes = await readFile(encrypted); bytes[bytes.length - 1] ^= 1;
  const broken = resolve(directory, 'tampered.age'); await writeFile(broken, bytes, { mode: 0o600 });
  await assert.rejects(privateCommand('age', ['--decrypt', '--identity', key, broken], { outputFile: resolve(directory, 'refused.backup'), limit: 16 * 1024 * 1024 }), /OPERATOR_COMMAND_FAILED/);
  const summary = { ...report, ...cipher, source: 'disposable-loopback-fixtures-only', exportedSnapshotConsistency: true, sourceControlsUnchanged: true, encryptionRoundtrip: true, tamperRejected: true, privateFileModes: true, completed: true };
  await writeFile('backend-test-results/hosted-recovery-summary.json', JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary)); complete = true;
} catch (error) { console.error(JSON.stringify({ stage: error.recoveryStage ?? stage, code: /^[A-Z0-9]{5}$/.test(error.code ?? '') ? error.code : 'NATIVE_RECOVERY_FAILED' })); process.exitCode = 1; }
finally {
  await source.end(); await env.sql.end(); await rm(directory, { recursive: true, force: true });
  if (!complete) process.exitCode = 1;
}
