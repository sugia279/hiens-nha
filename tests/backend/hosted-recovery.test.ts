import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testDatabase } from './helpers/database';
import { hostedRecoveryConfig, databaseFingerprint, tableFingerprint, publicProjection, verifyRestored } from '../../scripts/backend/hosted-recovery-model.mjs';
import { artifactPageBytes, assertArtifactBudget } from '../../scripts/backend/backup-artifact-budget.mjs';
import { privateCommand } from '../../scripts/backend/hosted-recovery-engine.mjs';
const owner = '10000000-0000-0000-0000-000000000003';
const recipient = 'age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p';
const valid = { CI:'true',BACKUP_STORAGE_QUOTA_CHECKED:'true',GITHUB_REPOSITORY:'sugia279/hiens-nha',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',HOSTED_BACKUP_PROJECT_REF:'eqxlywwvchmzuyqtxexu',GITHUB_SHA:'a'.repeat(40),BACKUP_AGE_RECIPIENT:recipient,SUPABASE_DB_URL:'postgresql://postgres.eqxlywwvchmzuyqtxexu:private%40fixture@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres' };
let db: Awaited<ReturnType<typeof testDatabase>>, directory: string;
beforeAll(async()=> { db=await testDatabase(); directory=await mkdtemp(join(tmpdir(),'hn-recovery-test-')); await db.query('insert into auth.users values($1,\'{}\')',[owner]); await db.query("insert into public.role_assignments(user_id,role) values($1,'owner')",[owner]); },30000);
afterAll(async()=>{await db?.close();if(directory)await rm(directory,{recursive:true,force:true});});
it('accepts only the approved main-only session-pooler target and public recipient',()=>{
  const config=hostedRecoveryConfig(valid);expect(config.password).toBe('private@fixture');expect(config.projectRef).toBe(valid.HOSTED_BACKUP_PROJECT_REF);
  for(const change of [ {CI:'false'},{BACKUP_STORAGE_QUOTA_CHECKED:'false'},{GITHUB_REF:'refs/heads/other'},{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_REPOSITORY:'other/repo'},{HOSTED_BACKUP_PROJECT_REF:'other'},{BACKUP_AGE_RECIPIENT:'AGE-SECRET-KEY-DO-NOT-ACCEPT'},{SUPABASE_DB_URL:valid.SUPABASE_DB_URL.replace('5432','6543')},{SUPABASE_DB_URL:valid.SUPABASE_DB_URL.replace('ap-southeast-1','us-east-1')},{SUPABASE_DB_URL:valid.SUPABASE_DB_URL+'?sslmode=disable'},{SUPABASE_DB_URL:valid.SUPABASE_DB_URL+'?options=untrusted'},{SUPABASE_DB_URL:valid.SUPABASE_DB_URL.replace('eqxlywwvchmzuyqtxexu','otherproject')} ]) {
    expect(()=>hostedRecoveryConfig({...valid,...change})).toThrow('HOSTED_RECOVERY_CONFIGURATION_REQUIRED');
  }
  try {hostedRecoveryConfig({...valid,SUPABASE_DB_URL:'invalid private@fixture'});} catch(error) {expect(String(error)).not.toContain('private@fixture');}
});
it('fingerprints are stable, quote catalog identifiers, and detect content/schema changes',async()=>{
  const before=await databaseFingerprint(db);expect(await databaseFingerprint(db)).toEqual(before);
  const name='quoted";drop table public.profiles;--';await db.query('create table public."'+name.replaceAll('"','""')+'"(body text)');
  const digest=await tableFingerprint(db,'public',name);expect(digest.count).toBe(0);
  await db.query('drop table public."'+name.replaceAll('"','""')+'"');expect(await databaseFingerprint(db)).toEqual(before);
  const original=(await db.query<{stamp:string}>("select created_at::text stamp from public.profiles where id=$1",[owner])).rows[0]!.stamp;
  await db.query("update public.profiles set created_at=created_at+interval '1 day' where id=$1",[owner]);expect(await databaseFingerprint(db)).not.toEqual(before);
  await db.query('update public.profiles set created_at=$1 where id=$2',[original,owner]);
});
it('verifies parity, owner/RLS and frozen replica writes; rejects changed state',async()=>{
  const before=await databaseFingerprint(db);await db.query('begin');const projection=await publicProjection(db);await db.query('rollback');
  const checks=await verifyRestored(db,before,projection,[owner]);expect(checks).toMatchObject({checksumsMatch:true,privateDenied:true,ownerPreserved:true,restoredWritesDisabled:true});
  await db.query("update public.profiles set created_at=created_at+interval '2 days' where id=$1",[owner]);
  await expect(verifyRestored(db,before,projection,[owner])).rejects.toThrow('RESTORE_FINGERPRINT_DIFFERS');
});
it('bounds/redacts subprocess output and creates private files exclusively',async()=>{
  const output=join(directory,'private.bin');await privateCommand(process.execPath,['-e','process.stdout.write("fixture")'],{outputFile:output});expect((await stat(output)).mode & 0o777).toBe(0o600);
  await expect(privateCommand(process.execPath,['-e','process.stdout.write("replacement")'],{outputFile:output})).rejects.toThrow('OPERATOR_COMMAND_FAILED');
  await expect(privateCommand(process.execPath,['-e','process.stderr.write("private-password-fixture");process.exit(2)'])).rejects.toThrow(/^OPERATOR_COMMAND_FAILED$/);
  await expect(privateCommand(process.execPath,['-e','process.stdout.write("x".repeat(1000))'],{limit:20})).rejects.toThrow('OPERATOR_OUTPUT_BOUND');
});

it('caps repository artifact storage and ignores only explicitly expired artifacts',()=>{
  expect(artifactPageBytes({artifacts:[{expired:false,size_in_bytes:100},{expired:true,size_in_bytes:999}]})).toBe(100);
  expect(()=>artifactPageBytes({artifacts:[{expired:false,size_in_bytes:-1}]})).toThrow('ARTIFACT_INVENTORY_INVALID');
  expect(()=>assertArtifactBudget(300*1024*1024)).toThrow('ARTIFACT_BUDGET_EXCEEDED');
  expect(()=>assertArtifactBudget(100,100)).not.toThrow();
});
