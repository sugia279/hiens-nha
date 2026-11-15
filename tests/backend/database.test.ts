import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import inputs from '../fixtures/backend-comment-inputs.json';

const A = '10000000-0000-0000-0000-000000000001';
const B = '10000000-0000-0000-0000-000000000002';
const O = '10000000-0000-0000-0000-000000000003';
const E = '20000000-0000-0000-0000-000000000001';
const F = '20000000-0000-0000-0000-000000000002';
let db: PGlite;
async function asUser<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? '']);
  try { return (await db.query<T>(sql, params)).rows; }
  finally { await db.exec('reset role'); }
}
async function create(user = A, body = 'hello', key = crypto.randomUUID(), parent: string | null = null, entity = E) {
  return (await asUser(user, 'select * from public.create_comment($1,$2,$3,$4)', [entity, body, key, parent]))[0]!;
}
async function errorCode(promise: Promise<unknown>, code: string) { await expect(promise).rejects.toMatchObject({ code }); }
beforeAll(async () => {
  db = new PGlite();
  // Minimal Supabase auth boundary for actual PostgreSQL grants/RLS/RPC execution.
  // Does NOT emulate Auth token verification or PostgREST: those are separate gates.
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;`);
  await db.exec(readFileSync('supabase/migrations/202611140001_foundation.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/202611140002_comments_pilot.sql', 'utf8'));
  for (const id of [A, B, O]) await db.query("insert into auth.users values($1, '{\"role\":\"owner\"}')", [id]);
  await db.query("insert into public.role_assignments(user_id,role) values($1,'owner')", [O]);
  await db.query("insert into public.content_entities(id,collection,legacy_key,canonical_path) values($1,'page','music','/hiens-nha/music/'),($2,'page','other','/hiens-nha/other/')", [E, F]);
}, 30000);
afterAll(async () => { await db.close(); });

describe('fresh migration and deny-first PostgreSQL permissions', () => {
  it('auth metadata never grants owner; unassigned moderator is just member', async () => {
    expect(await asUser(A, 'select * from public.role_assignments')).toEqual([]);
    expect((await asUser(O, 'select * from public.role_assignments'))[0]?.user_id).toBe(O);
    expect((await asUser(A, 'select * from public.profiles')).map(x => x.id)).toEqual([A]);
  });
  it('default mutation kill switch blocks direct RPC', async () => {
    await errorCode(create(), 'PT503');
    await db.exec("update private.backend_settings set comments_writes_enabled = true, comments_source = 'api', comments_epoch = 1");
  });
  it('denies direct insert/update/delete, role, profile, entity and audit writes', async () => {
    for (const user of [null, A, B, O]) {
      for (const sql of ["insert into public.comments(body,status) values('x','approved')", "update public.comments set status='approved'", 'delete from public.comments', "insert into public.role_assignments values(gen_random_uuid(),'owner',now())", 'delete from public.audit_events', 'update public.profiles set id=id', 'delete from public.content_entities', 'delete from public.comment_revisions', 'select * from private.mutation_keys', 'update private.backend_settings set comments_writes_enabled=true'])
        await errorCode(asUser(user, sql), '42501');
    }
    await errorCode(asUser(null, 'select public.create_comment($1,$2,$3)', [E, 'x', crypto.randomUUID()]), '42501');
  });
  it('every new table has RLS and public functions are invoker-only', async () => {
    const rows = (await db.query<{ relrowsecurity: boolean }>(`select relrowsecurity from pg_class c join pg_namespace n on c.relnamespace=n.oid where n.nspname in ('public','private') and c.relkind='r'`)).rows;
    expect(rows.length).toBe(12); expect(rows.every(x => x.relrowsecurity)).toBe(true);
    expect((await db.query(`select proname from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public' and prosecdef`)).rows).toEqual([]);
    expect((await db.query(`select proname from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='private' and prosecdef and not ('search_path=""'=any(proconfig))`)).rows).toEqual([]);
  });
});

describe('comment transaction contracts through direct RPC', () => {
  it('pending is visible only to its author/owner, then owner approval publishes', async () => {
    const c = await create(); const id = c.id;
    expect(c.status).toBe('pending');
    for (const u of [null, B]) expect(await asUser(u, 'select * from public.comments where id=$1', [id])).toEqual([]);
    for (const u of [A, O]) expect(await asUser(u, 'select * from public.comments where id=$1', [id])).toHaveLength(1);
    await errorCode(asUser(B, 'select * from public.moderate_comment($1,$2,$3,$4)', [id, 'approved', 1, 'self approval']), 'PT403');
    await errorCode(asUser(A, 'select * from public.moderate_comment($1,$2,$3,$4)', [id, 'approved', 1, 'self approval']), 'PT403');
    await asUser(O, 'select * from public.moderate_comment($1,$2,$3,$4)', [id, 'approved', 1, 'reviewed']);
    expect(await asUser(null, 'select * from public.comments where id=$1', [id])).toHaveLength(1);
    await errorCode(asUser(B, 'select * from public.edit_comment($1,$2,$3)', [id, 'forged', 2]), 'PT403');
    await errorCode(asUser(O, 'select * from public.edit_comment($1,$2,$3)', [id, 'owner rewrite', 2]), 'PT403');
    const edited = (await asUser(A, 'select * from public.edit_comment($1,$2,$3)', [id, '<script>text only</script>', 2]))[0]!;
    expect(edited.status).toBe('pending'); expect(edited.version).toBe(3);
    expect(await asUser(null, 'select * from public.comments where id=$1', [id])).toEqual([]);
    await errorCode(asUser(O, 'select * from public.moderate_comment($1,$2,$3,$4)', [id, 'approved', 2, 'stale approval']), 'PT409');
    expect(await asUser(B, 'select * from public.comment_revisions where comment_id=$1', [id])).toEqual([]);
    expect(await asUser(A, 'select * from public.comment_revisions where comment_id=$1', [id])).toHaveLength(3);
  });
  it('idempotency dedupes retries and rejects changed input', async () => {
    const key = crypto.randomUUID(); const first = await create(A, 'one', key); const second = await create(A, 'one', key);
    expect(second.id).toBe(first.id);
    await errorCode(create(A, 'two', key), 'PT409');
    expect((await db.query('select * from public.audit_events where comment_id=$1', [first.id])).rows).toHaveLength(1);
    expect(await asUser(A, 'select * from public.audit_events')).toEqual([]);
  });
  it('validates direct RPC body, entity, depth and same-entity parent', async () => {
    for (const body of inputs.valid) expect((await create(A, body)).body).toBe(body);
    for (const body of [...inputs.invalid, 'a'.repeat(4001)]) await errorCode(create(A, body), 'PT422');
    await errorCode(create(A, 'hi', crypto.randomUUID(), null, crypto.randomUUID()), 'PT404');
    const root = await create(O); const child = await create(A, 'reply', crypto.randomUUID(), root.id as string);
    await errorCode(create(A, 'depth2', crypto.randomUUID(), child.id as string), 'PT422');
    await errorCode(create(A, 'other entity', crypto.randomUUID(), root.id as string, F), 'PT422');
    const hidden = await create(B); await errorCode(create(A, 'hidden parent', crypto.randomUUID(), hidden.id as string), 'PT422');
    // Published reply disappears when the public root is hidden; no orphan leak.
    await asUser(O, 'select * from public.moderate_comment($1,$2,$3,$4)', [child.id, 'approved', 1, 'reviewed']);
    expect(await asUser(null, 'select * from public.comments where id=$1', [child.id])).toHaveLength(1);
    await asUser(O, 'select * from public.moderate_comment($1,$2,$3,$4)', [root.id, 'hidden', 1, 'withdraw root']);
    expect(await asUser(null, 'select * from public.comments where id=$1', [child.id])).toEqual([]);
  });
  it('soft delete is author-only, versioned, and cannot be reapproved', async () => {
    const c = await create();
    await errorCode(asUser(B, 'select * from public.delete_comment($1,$2)', [c.id, 1]), 'PT403');
    await errorCode(asUser(A, 'select * from public.delete_comment($1,$2)', [c.id, 2]), 'PT409');
    const deleted = (await asUser(A, 'select * from public.delete_comment($1,$2)', [c.id, 1]))[0]!;
    expect(deleted.body).toBe(''); expect(deleted.status).toBe('hidden'); expect(deleted.deleted_at).toBeTruthy();
    await errorCode(asUser(O, 'select * from public.moderate_comment($1,$2,$3,$4)', [c.id, 'approved', 2, 'restore']), 'PT404');
  });
  it('DB quota applies directly and failed writes leave no partial audit', async () => {
    await db.exec('delete from private.write_windows');
    for (let i = 0; i < 30; i++) await create(B, `quota-${i}`);
    const before = await db.query('select count(*) from public.audit_events');
    await errorCode(create(B, 'over quota'), 'PT429');
    expect((await db.query('select count(*) from public.audit_events')).rows).toEqual(before.rows);
    await db.exec('delete from private.write_windows');
  });
});
