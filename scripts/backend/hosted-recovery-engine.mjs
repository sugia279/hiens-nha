import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, stat, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import postgres from 'postgres';
import { postgresAdapter } from './postgres-adapter.mjs';
import { maxBackupBytes } from './backup-artifact-budget.mjs';
import { loopback } from './local-environment.mjs';
import { databaseFingerprint, publicProjection, verifyRestored, identifier, recoverySchemas } from './hosted-recovery-model.mjs';
const maxDumpBytes = 512 * 1024 * 1024;
const cleanEnv = () => ({ PATH: process.env.PATH, LANG: 'C.UTF-8', TZ: 'UTC' });
/** Never inherits/prints command output. Raw dump bytes are streamed to mode0600 only.
 * @param {string} command
 * @param {string[]} args
 * @param {{env?: Record<string,string|undefined>,inputFile?: string,outputFile?: string,limit?: number,timeout?: number}} [options]
 */
export async function privateCommand(command, args, { env = {}, inputFile, outputFile, limit = 65536, timeout = 300000 } = {}) {
  const child = spawn(command, args, { env: { ...cleanEnv(), ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stderr.resume();
  child.stdin.on('error', () => {});
  const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
  const closed = new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error('OPERATOR_COMMAND_FAILED')));
    child.once('close', code => code === 0 ? resolve() : reject(new Error('OPERATOR_COMMAND_FAILED')));
  });
  let size = 0; const pieces = [];
  const bound = new Transform({ transform(chunk, _encoding, callback) {
    size += chunk.length;
    if (size > limit) { child.kill('SIGKILL'); callback(new Error('OPERATOR_OUTPUT_BOUND')); }
    else callback(null, chunk);
  }});
  const output = outputFile
    ? pipeline(child.stdout, bound, createWriteStream(outputFile, { flags: 'wx', mode: 0o600 }))
    : pipeline(child.stdout, bound, new Writable({ write(chunk, _encoding, callback) { pieces.push(chunk); callback(); } }));
  const input = inputFile ? pipeline(createReadStream(inputFile), child.stdin) : (child.stdin.end(), Promise.resolve());
  try { await Promise.all([closed, output, input]); return outputFile ? size : Buffer.concat(pieces); }
  catch (error) { child.kill('SIGKILL'); throw new Error(error.message === 'OPERATOR_OUTPUT_BOUND' ? 'OPERATOR_OUTPUT_BOUND' : 'OPERATOR_COMMAND_FAILED'); }
  finally { clearTimeout(timer); }
}
export async function fileSha256(path) {
  const hash = createHash('sha256'); for await (const bytes of createReadStream(path)) hash.update(bytes); return hash.digest('hex');
}
export async function validateRecipient(recipient) {
  await privateCommand('age', ['--encrypt', '--recipient', recipient]);
}
export async function encryptDump(raw, recipient, output) {
  await validateRecipient(recipient);
  await privateCommand('age', ['--encrypt', '--recipient', recipient, raw], { outputFile: output, limit: maxBackupBytes });
  const file = await open(output, 'r');
  try { const bytes = Buffer.alloc(22); await file.read(bytes, 0, bytes.length, 0); if (!bytes.toString().startsWith('age-encryption.org/v1\n')) throw new Error('CIPHERTEXT_FORMAT_REQUIRED'); }
  finally { await file.close(); }
  return { ciphertextSha256: await fileSha256(output), ciphertextBytes: (await stat(output)).size };
}
export async function recoveryTarget() {
  if (process.env.CI !== 'true' && process.env.ALLOW_LOCAL_REHEARSAL !== 'hiens-nha-disposable') throw new Error('DISPOSABLE_TARGET_REQUIRED');
  const status = JSON.parse(await readFile('backend-test-results/stack.json', 'utf8'));
  const url = loopback(status.DB_URL ?? status.db_url);
  const config = await readFile('supabase/config.toml', 'utf8');
  const project = config.match(/^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m)?.[1];
  if (!project) throw new Error('DISPOSABLE_TARGET_REQUIRED');
  return { url: url.href, container: 'supabase_db_' + project };
}
/** Generic engine is used by a strictly guarded hosted entrypoint and local-only CI. */
export async function rehearseSnapshot({ source, target, rawPath, dump, expectedGithubOwner, afterSnapshot }) {
  loopback(target.url);
  if (!/^supabase_db_[A-Za-z0-9_-]+$/.test(target.container)) throw new Error('DISPOSABLE_TARGET_REQUIRED');
  const admin = postgres(target.url, { max: 1, onnotice: () => {} });
  const name = 'hn_cloud_restore_' + crypto.randomUUID().replaceAll('-', '');
  let replica, created = false, recoveryStage = 'source-transaction';
  const started = performance.now();
  try {
    const snapshot = await source.begin('isolation level repeatable read read only', async sql => {
      const db = postgresAdapter(sql);
      await sql.unsafe("set local timezone='UTC';set local search_path=pg_catalog,public;set local statement_timeout='120s';set local idle_in_transaction_session_timeout='10min'");
      const ownerIds = Array.from(await sql.unsafe("select user_id from public.role_assignments where role='owner' order by user_id"), r => r.user_id);
      if (!ownerIds.length) throw new Error('VERIFIED_OWNER_REQUIRED');
      if (expectedGithubOwner) {
        const owners = await sql.unsafe("select r.user_id from public.role_assignments r join auth.identities i on i.user_id=r.user_id where r.role='owner' and i.provider='github' and i.provider_id=$1", [expectedGithubOwner]);
        if (owners.length !== 1 || ownerIds.length !== 1) throw new Error('VERIFIED_OWNER_REQUIRED');
      }
      const major = Number((await sql.unsafe("select current_setting('server_version_num') as version"))[0].version) / 10000 | 0;
      if (major !== 17) throw new Error('POSTGRES_VERSION_DIFFERS');
      const roles = Array.from(await sql.unsafe("select rolname from pg_roles where rolname !~ '^pg_' order by rolname"), r => r.rolname);
      recoveryStage = 'source-fingerprint'; const before = await databaseFingerprint(db);
      recoveryStage = 'source-public-projection'; const publicBefore = await publicProjection(db);
      recoveryStage = 'snapshot-export'; const id = (await sql.unsafe('select pg_export_snapshot() as id'))[0].id;
      if (afterSnapshot) await afterSnapshot(); // Only the local native test passes this hook.
      recoveryStage = 'snapshot-dump'; await dump(id, rawPath);
      recoveryStage = 'source-private-denial';
      // postgres.js tracks errors per callback scope, even after a raw SQL ROLLBACK TO.
      // Its savepoint API keeps this expected denial out of the enclosing snapshot scope.
      let denied = false;
      try { await sql.savepoint(async tx => { await tx.unsafe('set local role anon'); await tx.unsafe('select * from private.feature_receipts limit 1'); }); }
      catch (error) { if (error.code !== '42501') throw error; denied = true; }
      if (!denied) throw new Error('PRIVATE_ACCESS_ALLOWED');
      const header = await open(rawPath, 'r');
      try { const bytes = Buffer.alloc(5); await header.read(bytes, 0, 5, 0); if (bytes.toString() !== 'PGDMP') throw new Error('CUSTOM_DUMP_REQUIRED'); }
      finally { await header.close(); }
      recoveryStage = 'source-transaction-complete'; return { before, publicBefore, ownerIds, roles };
    });
    recoveryStage = 'local-role-prerequisites'; const existingRoles = new Set(Array.from(await admin.unsafe('select rolname from pg_roles'), r => r.rolname));
    // Names needed for object owners/ACLs only, in the disposable cluster. No login or memberships.
    for (const role of snapshot.roles) if (!existingRoles.has(role)) await admin.unsafe(`create role ${identifier(role)} nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls`);
    recoveryStage = 'local-create-database'; await admin.unsafe(`create database ${identifier(name)}`); created = true;
    const url = new URL(target.url); url.pathname = '/' + name;
    replica = postgres(url.href, { max: 1, onnotice: () => {} });
    recoveryStage = 'local-extensions'; await replica.unsafe("set timezone='UTC';set search_path=pg_catalog,public;drop schema public cascade;create schema if not exists extensions;create extension if not exists pgcrypto with schema extensions;create extension if not exists \"uuid-ossp\" with schema extensions");
    recoveryStage = 'local-pg-restore'; await privateCommand('docker', ['exec', '-i', target.container, 'pg_restore', '-U', 'supabase_admin', '-d', name, '--single-transaction', '--exit-on-error'], { inputFile: rawPath });
    recoveryStage = 'local-verify'; const checks = await verifyRestored(postgresAdapter(replica), snapshot.before, snapshot.publicBefore, snapshot.ownerIds);
    return { scope: 'hosted/local source logical public/private/Auth/migration schemas; disposable local restore; existing cluster role capabilities',
      tables: snapshot.before.data.length, rows: snapshot.before.data.reduce((sum, t) => sum + t.count, 0),
      dataFingerprint: createHash('sha256').update(JSON.stringify(snapshot.before)).digest('hex'),
      dumpSha256: await fileSha256(rawPath), dumpBytes: (await stat(rawPath)).size,
      recoveryMilliseconds: Math.round(performance.now() - started), ...checks };
  } catch (error) { error.recoveryStage = recoveryStage; throw error; } finally {
    try { if (replica) await replica.end(); }
    finally { try { if (created) await admin.unsafe(`drop database ${identifier(name)} with (force)`); } finally { await admin.end(); } }
  }
}
export function hostedDump(config, container) {
  return async (snapshot, path) => {
    if (!/^[A-F0-9-]+$/i.test(snapshot)) throw new Error('INVALID_SNAPSHOT');
    const env = { PGHOST: config.host, PGPORT: '5432', PGDATABASE: config.database, PGUSER: config.username, PGPASSWORD: config.password,
      PGSSLMODE: 'verify-full', PGSSLROOTCERT: '/etc/ssl/certs/ca-certificates.crt', PGCONNECT_TIMEOUT: '15',
      PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=120000 -c timezone=UTC' };
    await privateCommand('docker', ['exec', '-i', ...Object.keys(env).flatMap(key => ['--env', key]), container, 'pg_dump', '--no-password', '--format=custom', '--snapshot=' + snapshot,
      ...recoverySchemas.map(schema => '--schema=' + schema)], { env, outputFile: path, limit: maxDumpBytes });
  };
}
