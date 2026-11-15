import { checksum } from '../migration/comments-model.mjs';
export const recoverySchemas = ['public', 'private', 'auth', 'supabase_migrations'];
export const recoveryProject = 'eqxlywwvchmzuyqtxexu';
export const identifier = value => '"' + String(value).replaceAll('"', '""') + '"';
export function hostedRecoveryConfig(env) {
  try {
    if (env.CI !== 'true' || env.BACKUP_STORAGE_QUOTA_CHECKED !== 'true' || env.GITHUB_REPOSITORY !== 'sugia279/hiens-nha' || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.HOSTED_BACKUP_PROJECT_REF !== recoveryProject || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')) throw 0;
    const url = new URL(env.SUPABASE_DB_URL ?? '');
    const username = decodeURIComponent(url.username), password = decodeURIComponent(url.password);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || username !== 'postgres.' + recoveryProject || !password || password.includes('\0') || password.length > 1024 || !/^aws-\d+-ap-southeast-1\.pooler\.supabase\.com$/.test(url.hostname) || url.port !== '5432' || url.pathname !== '/postgres' || url.hash) throw 0;
    if ([...url.searchParams].some(([key, value]) => key !== 'sslmode' || !['require', 'verify-ca', 'verify-full'].includes(value))) throw 0;
    const recipient = (env.BACKUP_AGE_RECIPIENT ?? '').trim();
    if (!/^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$/.test(recipient)) throw 0;
    return { host: url.hostname, port: 5432, database: 'postgres', username, password, recipient, projectRef: recoveryProject, sourceCommit: env.GITHUB_SHA };
  } catch { throw new Error('HOSTED_RECOVERY_CONFIGURATION_REQUIRED'); }
}
const hash = expression => `encode(sha256(convert_to(${expression},'UTF8')),'hex')`;
export async function tableFingerprint(db, schema, table) {
  const rows = await db.query(`select count(*)::text as count,${hash("coalesce(string_agg(h,'|' order by h),'')")} as checksum from (select ${hash('to_jsonb(t)::text')} h from ${identifier(schema)}.${identifier(table)} t) hashes`);
  const count = Number(rows.rows[0].count);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('INVALID_RESTORE_COUNT');
  return { table: schema + '.' + table, count, checksum: rows.rows[0].checksum };
}
export async function databaseFingerprint(db) {
  const tables = (await db.query("select table_schema,table_name from information_schema.tables where table_type='BASE TABLE' and table_schema=any($1::text[]) order by table_schema collate \"C\",table_name collate \"C\"", [recoverySchemas])).rows;
  const data = [];
  for (const t of tables) data.push(await tableFingerprint(db, t.table_schema, t.table_name));
  const columns = (await db.query("select table_schema,table_name,column_name,udt_schema,udt_name,is_nullable,column_default,is_identity,identity_generation from information_schema.columns where table_schema=any($1::text[]) order by table_schema collate \"C\",table_name collate \"C\",ordinal_position", [recoverySchemas])).rows;
  const rls = (await db.query("select n.nspname as schema,c.relname as name,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=any($1::text[]) and c.relkind in ('r','p') order by n.nspname collate \"C\",c.relname collate \"C\"", [recoverySchemas])).rows;
  const policies = (await db.query("select schemaname,tablename,policyname,permissive,(select array_agg(x::text order by x::text collate \"C\") from unnest(roles) x) roles,cmd,qual,with_check from pg_policies where schemaname=any($1::text[]) order by schemaname collate \"C\",tablename collate \"C\",policyname collate \"C\"", [recoverySchemas])).rows;
  return { data, schemaChecksum: checksum({ columns: Array.from(columns), rls: Array.from(rls), policies: Array.from(policies) }) };
}
/** Caller supplies an active transaction. No table body/Auth credential leaves this function. */
export async function publicProjection(db) {
  await db.query("select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true)");
  await db.query('set local role anon');
  try { return { comments: await tableFingerprint(db, 'public', 'comments'), entities: await tableFingerprint(db, 'public', 'content_entities') }; }
  finally { await db.query('reset role'); }
}
export async function assertPrivateDenied(db) {
  await db.query('savepoint hn_private_probe');
  let denied = false;
  try { await db.query('set local role anon'); await db.query('select * from private.feature_receipts limit 1'); }
  catch (error) { if (error.code !== '42501') throw error; denied = true; }
  finally { await db.query('rollback to savepoint hn_private_probe'); await db.query('release savepoint hn_private_probe'); }
  if (!denied) throw new Error('PRIVATE_ACCESS_ALLOWED');
}
export async function verifyRestored(db, before, publicBefore, ownerIds) {
  if (!ownerIds.length) throw new Error('VERIFIED_OWNER_REQUIRED');
  if (checksum(await databaseFingerprint(db)) !== checksum(before)) throw new Error('RESTORE_FINGERPRINT_DIFFERS');
  await db.query('begin');
  try {
    if (checksum(await publicProjection(db)) !== checksum(publicBefore)) throw new Error('PUBLIC_PROJECTION_DIFFERS');
    await assertPrivateDenied(db);
    await db.query('update private.backend_settings set comments_writes_enabled=false where singleton');
    await db.query('update private.feature_controls set writes_enabled=false');
    for (const owner of ownerIds) {
      await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [owner, JSON.stringify({sub:owner,role:'authenticated'})]);
      await db.query('set local role authenticated');
      const found = (await db.query("select user_id from public.role_assignments where user_id=$1 and role='owner'", [owner])).rows;
      if (found.length !== 1) throw new Error('RESTORED_OWNER_DIFFERS');
      await db.query('reset role');
    }
    await db.query('savepoint hn_mutation_probe');
    let frozen = false;
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [ownerIds[0], JSON.stringify({sub:ownerIds[0],role:'authenticated'})]);
      await db.query('set local role authenticated');
      await db.query("select public.publication_write(p_feature=>'posts',p_action=>'create',p_payload=>'{}',p_key=>$1)", [crypto.randomUUID()]);
    } catch (error) { if (error.code !== 'PT503') throw error; frozen = true; }
    finally { await db.query('rollback to savepoint hn_mutation_probe'); await db.query('release savepoint hn_mutation_probe'); }
    if (!frozen) throw new Error('RESTORED_WRITES_NOT_FROZEN');
    await db.query('commit');
  } catch (error) { await db.query('rollback'); throw error; }
  return { checksumsMatch: true, schemaMatches: true, publicProjectionMatches: true, privateDenied: true, ownerPreserved: true, restoredWritesDisabled: true };
}
