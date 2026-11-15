import { resolve } from 'node:path';
import { mkdir, mkdtemp, lstat, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import { hostedRecoveryConfig } from './hosted-recovery-model.mjs';
import { validateRecipient, recoveryTarget, rehearseSnapshot, hostedDump, encryptDump } from './hosted-recovery-engine.mjs';
let stage = 'configuration', source, rawDirectory, outputCreated = false, report, failure;
const outputDirectory = resolve('backend-test-results/hosted-export');
try {
  const config = hostedRecoveryConfig(process.env);
  if (process.env.GITHUB_WORKFLOW_REF !== 'sugia279/hiens-nha/.github/workflows/hosted-recovery.yml@refs/heads/main' || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== config.sourceCommit) throw new Error('WORKFLOW_CONTEXT_REQUIRED');
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== '--check-config')) throw new Error('WORKFLOW_CONTEXT_REQUIRED');
  stage = 'recipient'; await validateRecipient(config.recipient);
  if (args.length) report = { configurationValidated: true, projectRef: config.projectRef, hostedSourceContacted: false };
  else {
    const root = resolve('backend-test-results'); await mkdir(root, { recursive: true });
    if ((await lstat(root)).isSymbolicLink()) throw new Error('PRIVATE_DIRECTORY_REQUIRED');
    execFileSync('git', ['check-ignore', '--quiet', '--', outputDirectory]);
    await mkdir(outputDirectory, { mode: 0o700 }); outputCreated = true;
    rawDirectory = await mkdtemp(resolve(root, 'hosted-private-'));
    const raw = resolve(rawDirectory, 'application-auth.backup');
    stage = 'local-target'; const target = await recoveryTarget();
    source = postgres({ host: config.host, port: config.port, database: config.database, username: config.username, password: config.password,
      ssl: { rejectUnauthorized: true }, max: 1, connect_timeout: 15, idle_timeout: 0, max_lifetime: null, onnotice: () => {}, debug: false });
    stage = 'snapshot-and-local-restore';
    const verified = await rehearseSnapshot({ source, target, rawPath: raw, dump: hostedDump(config, target.container), expectedGithubOwner: '10128207' });
    await source.end(); source = null;
    stage = 'encryption';
    const encrypted = await encryptDump(raw, config.recipient, resolve(outputDirectory, 'application-auth.backup.age'));
    stage = 'private-cleanup'; await rm(rawDirectory, { recursive: true, force: true }); rawDirectory = null;
    report = { version: 1, projectRef: config.projectRef, sourceCommit: config.sourceCommit, createdAt: new Date().toISOString(),
      recipientFingerprint: createHash('sha256').update(config.recipient).digest('hex'), retentionDays: 30,
      ...verified, ...encrypted, sourceReadOnly: true, privateIdentityUploaded: false,
      offlineDecryptionVerified: false, hostedProjectRestoreVerified: false, completed: true };
    stage = 'manifest'; await writeFile(resolve(outputDirectory, 'manifest.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
} catch (error) {
  const safe = new Set(['HOSTED_RECOVERY_CONFIGURATION_REQUIRED','WORKFLOW_CONTEXT_REQUIRED','PRIVATE_DIRECTORY_REQUIRED','OPERATOR_COMMAND_FAILED','OPERATOR_OUTPUT_BOUND','DISPOSABLE_TARGET_REQUIRED','VERIFIED_OWNER_REQUIRED','POSTGRES_VERSION_DIFFERS','INVALID_SNAPSHOT','CUSTOM_DUMP_REQUIRED','RESTORE_FINGERPRINT_DIFFERS','PUBLIC_PROJECTION_DIFFERS','PRIVATE_ACCESS_ALLOWED','RESTORED_OWNER_DIFFERS','RESTORED_WRITES_NOT_FROZEN','CIPHERTEXT_FORMAT_REQUIRED','INVALID_RESTORE_COUNT']);
  failure = { stage: error.recoveryStage ?? stage, code: safe.has(error.message) ? error.message : /^[A-Z0-9]{5}$/.test(error.code ?? '') ? error.code : 'HOSTED_RECOVERY_FAILED' }; }
finally {
  try { if (source) await source.end(); if (rawDirectory) await rm(rawDirectory, { recursive: true, force: true }); }
  catch { failure ??= { stage: 'private-cleanup', code: 'PRIVATE_CLEANUP_FAILED' }; }
  if (failure && outputCreated) {
    try { await rm(outputDirectory, { recursive: true, force: true }); }
    catch { failure = { stage: 'output-cleanup', code: 'PRIVATE_CLEANUP_FAILED' }; }
  }
}
if (failure) { console.error(JSON.stringify(failure)); process.exitCode = 1; }
else console.log(JSON.stringify(report));
