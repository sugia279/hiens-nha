import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { testDatabase } from './helpers/database';

const A = '10000000-0000-0000-0000-000000000001';
const B = '10000000-0000-0000-0000-000000000002';
const O = '10000000-0000-0000-0000-000000000003';
const E = '20000000-0000-0000-0000-000000000001';
let db: Awaited<ReturnType<typeof testDatabase>>;
async function as(user: string | null, sql: string, args: unknown[] = []) {
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? '']);
  try { return (await db.query<any>(sql, args)).rows; }
  finally { await db.exec('reset role'); }
}
const create = async (user = A, parent: string | null = null, key = crypto.randomUUID()) =>
  (await as(user, 'select to_jsonb(public.create_comment($1,$2,$3,$4)) as item', [E, '<script>inert text</script>', key, parent]))[0].item;
const read = async (parent: string | null = null) =>
  (await as(null, 'select public.read_comments(p_entity_id=>$1,p_parent_id=>$2) as items', [E, parent]))[0].items;
beforeAll(async () => {
  db = await testDatabase();
  for (const id of [A, B, O]) await db.query('insert into auth.users values($1,\'{"role":"owner"}\')', [id]);
  await db.query("insert into public.role_assignments(user_id,role) values($1,'owner')", [O]);
  await db.query("insert into public.content_entities(id,collection,legacy_key,canonical_path) values($1,'page','social-home','/hiens-nha/')", [E]);
  await db.exec("update private.backend_settings set comments_source='api',comments_epoch=1,comments_writes_enabled=true");
}, 30000);
beforeEach(async () => { await db.exec('delete from private.read_windows; delete from private.write_windows'); });
afterAll(async () => { await db?.close(); });

it('publishes member roots, replies and visible edits immediately through the unchanged RPCs', async () => {
  const key = crypto.randomUUID(), root = await create(A, null, key);
  expect(root.status).toBe('approved');
  expect((await create(A, null, key)).id).toBe(root.id);
  expect((await read()).map((c: any) => c.id)).toContain(root.id);
  const reply = await create(B, root.id);
  expect(reply.status).toBe('approved');
  expect((await read(root.id)).map((c: any) => c.id)).toContain(reply.id);
  const edited = (await as(A, 'select to_jsonb(public.edit_comment($1,$2,1)) as item', [root.id, 'edited text']))[0].item;
  expect(edited).toMatchObject({ status: 'approved', version: 2 });
  expect((await read()).find((c: any) => c.id === root.id).body).toBe('edited text');
  expect((await db.query('select * from public.comment_revisions where comment_id=$1', [root.id])).rows).toHaveLength(2);
});

it('keeps owner moderation effective after author edits and prevents public orphan replies', async () => {
  const root = await create(), reply = await create(B, root.id);
  await as(O, "select public.moderate_comment($1,'hidden',1,'Owner hides root')", [root.id]);
  expect((await read(root.id)).map((c: any) => c.id)).not.toContain(reply.id);
  const edited = (await as(A, 'select to_jsonb(public.edit_comment($1,$2,2)) as item', [root.id, 'author tries to republish']))[0].item;
  expect(edited.status).toBe('hidden');
  expect((await read()).map((c: any) => c.id)).not.toContain(root.id);
  await expect(create(B, root.id)).rejects.toMatchObject({ code: 'PT422' });
  await as(O, "select public.moderate_comment($1,'rejected',3,'Rejected root')", [root.id]);
  expect((await as(A, 'select to_jsonb(public.edit_comment($1,$2,4)) as item', [root.id, 'still rejected']))[0].item.status).toBe('rejected');
});

it('preserves ownership, CAS, delete, direct table denial and writer maintenance controls', async () => {
  const root = await create();
  await expect(as(B, 'select public.edit_comment($1,$2,1)', [root.id, 'forged'])).rejects.toMatchObject({ code: 'PT403' });
  await expect(as(A, "select public.moderate_comment($1,'hidden',1,'forged')", [root.id])).rejects.toMatchObject({ code: 'PT403' });
  await expect(as(A, 'select public.edit_comment($1,$2,9)', [root.id, 'stale'])).rejects.toMatchObject({ code: 'PT409' });
  await expect(as(A, "update public.comments set status='approved'")).rejects.toMatchObject({ code: '42501' });
  await as(A, 'select public.delete_comment($1,1)', [root.id]);
  await expect(as(A, 'select public.edit_comment($1,$2,2)', [root.id, 'revive'])).rejects.toMatchObject({ code: 'PT404' });
  await db.exec('update private.backend_settings set comments_writes_enabled=false');
  await expect(create()).rejects.toMatchObject({ code: 'PT503' });
  await db.exec('update private.backend_settings set comments_writes_enabled=true');
});

it('does not publish pre-existing moderated or pending rows when the migration is reapplied', async () => {
  const { readFileSync } = await import('node:fs');
  const ids: string[] = [];
  for (const status of ['pending', 'hidden', 'rejected']) {
    const item = (await db.query<any>('insert into public.comments(entity_id,author_id,body,status) values($1,$2,$3,$4) returning id', [E, A, status, status])).rows[0];
    ids.push(item.id);
  }
  await db.exec(readFileSync('supabase/migrations/20261119160000_immediate_comments.sql', 'utf8'));
  expect((await db.query<any>('select status from public.comments where id=any($1) order by body', [ids])).rows.map(r => r.status)).toEqual(['hidden', 'pending', 'rejected']);
  for (const id of ids) expect((await read()).map((c: any) => c.id)).not.toContain(id);
});
