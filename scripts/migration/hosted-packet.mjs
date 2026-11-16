import { writeFile, chmod, mkdir, lstat, mkdtemp, rm } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { hostedDeployment } from '../../supabase/functions/_shared/hosted-deployment.ts';
import { readImportSnapshot } from './import-snapshot.mjs';
import { rehearsalDatabase } from './rehearsal-database.ts';
import { prepareHostedPacket } from './hosted-packet-model.mjs';
import { offlineBuildEnv, readBuildSources } from '../backend/build-source-env.mjs';

// Offline operator preparation only. Existing network CLIs remain loopback-only.
let db, contextDir;
try {
  const args = process.argv.slice(2), options = {};
  if (args.length % 2) throw new Error('Invalid arguments');
  for (let i = 0; i < args.length; i += 2) {
    if (!['--project-ref', '--source-commit', '--out'].includes(args[i]) || options[args[i]]) throw new Error('Invalid arguments');
    options[args[i]] = args[i + 1];
  }
  if (options['--project-ref'] !== hostedDeployment.projectRef || !/^[a-f0-9]{40}$/.test(options['--source-commit'] ?? '')) throw new Error('Reviewed target/source required');
  const out = resolve(options['--out'] ?? 'backend-test-results/hosted-import-packet.json');
  const rel = relative(resolve('backend-test-results'), out);
  if (!rel || rel.startsWith('..') || !rel.endsWith('.json') || dirname(out) !== resolve('backend-test-results')) throw new Error('Ignored operator output required');
  await mkdir(dirname(out), { recursive: true });
  if ((await lstat(dirname(out))).isSymbolicLink()) throw new Error('Operator output cannot be a symlink');
  execFileSync('git', ['check-ignore', '--quiet', '--', out]);
  try { await lstat(out); throw new Error('Existing packet must not be overwritten'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  contextDir = await mkdtemp(resolve('backend-test-results/import-contexts-'));
  const env = { ...process.env, ...offlineBuildEnv(...readBuildSources()) };
  execFileSync(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build', '--outDir', contextDir], { env, stdio: 'pipe', maxBuffer: 16 * 1024 * 1024 });
  const snapshot = await readImportSnapshot(options['--source-commit'], { dist: contextDir });
  db = await rehearsalDatabase();
  const packet = await prepareHostedPacket(db, snapshot, options['--project-ref']);
  await writeFile(out, JSON.stringify(packet), { mode: 0o600, flag: 'wx' }); await chmod(out, 0o600);
  const { applySql, shadowSql, checkSql, ...report } = packet;
  console.log(JSON.stringify(report, null, 2));
} catch {
  console.error('Hosted packet preparation failed; verify reviewed target/source, built contexts and local schema. No packet contents or credentials printed.');
  process.exitCode = 1;
} finally { if (db) await db.close(); if (contextDir) await rm(contextDir, { recursive: true, force: true }); }
