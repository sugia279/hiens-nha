import { afterAll, beforeAll, expect, it } from 'vitest';
import { testDatabase } from './helpers/database';
import { packetSnapshot, attackText } from './helpers/packet-snapshot.mjs';
import { prepareHostedPacket, reconcileSnapshot, captureImportState } from '../../scripts/migration/hosted-packet-model.mjs';
const project = 'a'.repeat(20), owner = '10000000-0000-0000-0000-000000000003';
let source: Awaited<ReturnType<typeof testDatabase>>, target: Awaited<ReturnType<typeof testDatabase>>, packet: Awaited<ReturnType<typeof prepareHostedPacket>>;
beforeAll(async () => {
  source = await testDatabase(); target = await testDatabase();
  packet = await prepareHostedPacket(source, packetSnapshot(), project);
  await target.query('insert into auth.users values($1,\'{"role":"owner"}\')', [owner]);
  await target.query("insert into public.role_assignments(user_id,role) values($1,'owner')", [owner]);
}, 30000);
afterAll(async () => { await source?.close(); await target?.close(); });
it('atomically imports typed content, preserves the existing owner and verifies anon/pending projections', async () => {
  await target.exec(packet.applySql);
  expect((await target.query<{body:string}>('select body from public.comments where parent_id is null and deleted_at is null order by created_at,id')).rows.map(r => r.body)).toContain(attackText);
  expect(await reconcileSnapshot(target, packetSnapshot())).toEqual(packet.summary.shadow);
  expect((await target.query('select user_id,role from public.role_assignments')).rows).toEqual([{ user_id: owner, role: 'owner' }]);
  expect((await target.query<{n:number}>('select count(*)::int n from auth.users')).rows[0]!.n).toBe(1);
  expect((await target.query('select distinct author_id from public.comments')).rows).toEqual([{ author_id: null }]);
  expect((await target.query('select comments_source,comments_epoch,comments_writes_enabled from private.backend_settings')).rows).toEqual([{ comments_source: 'git', comments_epoch: 0, comments_writes_enabled: false }]);
});
it('replays unchanged, including a regenerated packet, without changing timestamps, history or ownership', async () => {
  const before = await captureImportState(target);
  await target.exec(packet.applySql);
  const another = await testDatabase();
  try {
    const regenerated = await prepareHostedPacket(another, packetSnapshot(), project);
    expect(regenerated.runKey).toBe(packet.runKey);
    await target.exec(regenerated.applySql);
  } finally { await another.close(); }
  expect(await captureImportState(target)).toEqual(before);
});
it('refuses drift and API-source controls before replaying a single row', async () => {
  await target.query("update public.comments set body='Unexpected delta' where id=$1", [packetSnapshot().comments.records[0].id]);
  const before = await captureImportState(target);
  await expect(target.exec(packet.applySql)).rejects.toThrow('Import state drift');
  expect(await captureImportState(target)).toEqual(before);
  await target.query('update public.comments set body=$1 where id=$2', [attackText, packetSnapshot().comments.records[0].id]);
  await target.exec("update private.feature_controls set source='api',epoch=1,writes_enabled=true where feature='posts'");
  await expect(target.exec(packet.applySql)).rejects.toThrow('Feature sources must remain frozen Git0');
});
it('rolls back all earlier inserts and the receipt after a late constraint failure', async () => {
  const empty = await testDatabase();
  try {
    await empty.exec("alter table private.help_requests add constraint local_failure check(status='new')");
    const before = await captureImportState(empty);
    await expect(empty.exec(packet.applySql)).rejects.toMatchObject({ code: '23514' });
    expect(await captureImportState(empty)).toEqual(before);
  } finally { await empty.close(); }
});
it('keeps the operator transport inaccessible to an anonymous role', async () => {
  const empty = await testDatabase();
  try {
    await empty.exec('set role anon');
    await expect(empty.exec(packet.applySql)).rejects.toMatchObject({ code: '42501' });
  } finally { await empty.exec('reset role'); await empty.close(); }
});
it('refuses an unexpected initial footprint instead of replacing existing rows', async () => {
  const existing = await testDatabase();
  try {
    await existing.query("insert into public.content_entities(id,collection,legacy_key,canonical_path) values($1,'page','unexpected','/unexpected/')", [owner]);
    const before = await captureImportState(existing);
    await expect(existing.exec(packet.applySql)).rejects.toThrow('Import state drift');
    expect(await captureImportState(existing)).toEqual(before);
  } finally { await existing.close(); }
});
it('keeps pending private even if a permissive RLS policy is accidentally added', async () => {
  const exposed = await testDatabase();
  try {
    await exposed.exec('create policy unsafe_fixture on public.comments for select to anon using(true)');
    await exposed.exec(packet.applySql);
    expect(await reconcileSnapshot(exposed,packetSnapshot())).toEqual(packet.summary.shadow);
    await exposed.exec('set role anon');
    await expect(exposed.query('select * from public.comments')).rejects.toMatchObject({code:'42501'});
    await exposed.exec('reset role');
  } finally { await exposed.close(); }
});

it('rolls back the entire import if the public RPC projection leaks pending data',async()=>{
 const exposed=await testDatabase();
 try {
  await exposed.exec(`create or replace function private.comment_projection(p_entity_id uuid default null,p_after_time timestamptz default null,p_after_id uuid default null,p_limit integer default 20,p_parent_id uuid default null,p_mine boolean default false,p_feed boolean default false,p_shadow boolean default false) returns jsonb language sql stable security definer set search_path='' as $$ select coalesce(jsonb_agg(to_jsonb(c)),'[]') from public.comments c $$`);
  const before=await captureImportState(exposed);
  await expect(exposed.exec(packet.applySql)).rejects.toThrow('Comments public projection differs');
  expect(await captureImportState(exposed)).toEqual(before);
 } finally {await exposed.close();}
});
