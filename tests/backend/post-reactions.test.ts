import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { testDatabase } from './helpers/database';
const owner = '10000000-0000-0000-0000-000000000003',
  a = '10000000-0000-0000-0000-000000000001',
  b = '10000000-0000-0000-0000-000000000002';
let db: Awaited<ReturnType<typeof testDatabase>>;
let post: any, draft: any;
async function as(actor: string | null, sql: string, args: unknown[] = []) {
  await db.exec(`set role ${actor ? 'authenticated' : 'anon'}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    actor ?? '',
  ]);
  try {
    return (await db.query<any>(sql, args)).rows[0]?.data;
  } finally {
    await db.exec('reset role');
  }
}
const read = (actor: string | null, ids = [post.id]) =>
  as(actor, 'select public.post_reactions_read($1::uuid[]) as data', [ids]);
const set = (actor: string | null, reaction: string | null, id = post.id) =>
  as(actor, 'select public.post_reaction_set($1,$2) as data', [id, reaction]);
async function write(action: string, row: any = null) {
  return as(
    owner,
    `select public.publication_write(p_feature=>'posts',p_action=>$1,p_id=>$2,p_payload=>$3::jsonb,p_expected_version=>$4,p_key=>$5,p_revision=>$6,p_reason=>'Fixture') as data`,
    [
      action,
      row?.id ?? null,
      action === 'create'
        ? JSON.stringify({
            title: 'Fixture',
            body: 'Inert text',
            kind: 'note',
            category: 'Test',
            tags: ['test'],
            series: '',
            order: 1,
          })
        : null,
      row?.version ?? null,
      crypto.randomUUID(),
      row?.revision ?? null,
    ],
  );
}
beforeAll(async () => {
  db = await testDatabase();
  for (const id of [owner, a, b])
    await db.query("insert into auth.users values($1,'{}')", [id]);
  await db.query("insert into public.role_assignments values($1,'owner')", [
    owner,
  ]);
  await db.exec(
    "update private.feature_controls set source='api',epoch=1,writes_enabled=true",
  );
  draft = await write('create');
  post = await write('create');
  post = await write('submit', post);
  post = await write('approve', post);
}, 30000);
beforeEach(async () => {
  await db.exec(
    'delete from private.read_windows;delete from private.feature_windows',
  );
});
afterAll(async () => {
  await db?.close();
});
it('denies anonymous writes/direct access; validates kind and bounds batch reads', async () => {
  await expect(set(null, 'heart')).rejects.toMatchObject({ code: '42501' });
  for (const actor of [null, a, owner]) {
    await expect(
      as(actor, 'select * from private.post_reactions'),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      as(actor, 'select private.post_reactions_summary($1::uuid[]) as data', [
        [post.id],
      ]),
    ).rejects.toMatchObject({ code: '42501' });
  }
  await expect(set(a, 'like')).rejects.toMatchObject({ code: 'PT422' });
  await expect(read(null, Array(51).fill(post.id))).rejects.toMatchObject({
    code: 'PT422',
  });
  expect(await read(null, [])).toEqual([]);
});
it('sets, replaces and removes only the caller reaction; retries cannot double count', async () => {
  expect(await set(a, 'heart')).toMatchObject({
    heart: 1,
    laugh: 0,
    wow: 0,
    mine: 'heart',
  });
  expect(
    (
      await db.query<any>(
        "select count from private.read_windows where scope='member'",
      )
    ).rows[0].count,
  ).toBe(1);
  expect(await set(a, 'heart')).toMatchObject({ heart: 1, mine: 'heart' });
  await set(b, 'wow');
  expect(await set(a, 'laugh')).toMatchObject({
    heart: 0,
    laugh: 1,
    wow: 1,
    mine: 'laugh',
  });
  const publicCounts = (await read(null))[0];
  expect(publicCounts).toEqual({
    post_id: post.id,
    heart: 0,
    laugh: 1,
    wow: 1,
    mine: null,
  });
  expect((await read(b))[0].mine).toBe('wow');
  await set(a, null);
  expect(await set(a, null)).toMatchObject({ laugh: 0, wow: 1, mine: null });
});
it('excludes draft, deleted and unpublished posts, including owner; preserves reactions when republished', async () => {
  for (const actor of [null, a, owner])
    expect(await read(actor, [draft.id])).toEqual([]);
  await expect(set(owner, 'heart', draft.id)).rejects.toMatchObject({
    code: 'PT404',
  });
  post = await write('unpublish', post);
  expect(await read(null)).toEqual([]);
  await expect(set(a, 'heart')).rejects.toMatchObject({ code: 'PT404' });
  await db.query(
    'update private.publications set published_revision=working_revision where id=$1',
    [post.id],
  );
  expect((await read(null))[0].wow).toBe(1);
  await db.query(
    'update private.publications set deleted_at=now() where id=$1',
    [post.id],
  );
  expect(await read(owner)).toEqual([]);
  await expect(set(a, 'wow')).rejects.toMatchObject({ code: 'PT404' });
  await db.query(
    'update private.publications set deleted_at=null where id=$1',
    [post.id],
  );
});
it('enforces source maintenance, shared read admission and per-actor write quota via RPC', async () => {
  await db.exec(
    "update private.feature_controls set writes_enabled=false where feature='posts'",
  );
  await expect(set(a, 'heart')).rejects.toMatchObject({ code: 'PT503' });
  await db.exec(
    "update private.feature_controls set writes_enabled=true where feature='posts'",
  );
  await db.query(
    "insert into private.feature_windows values($1,'posts',date_trunc('minute',statement_timestamp()),30)",
    [a],
  );
  await expect(set(a, 'heart')).rejects.toMatchObject({ code: 'PT429' });
  await db.exec(
    "update private.read_budgets set max_per_second=1 where scope='anon'",
  );
  await read(null);
  await db.exec(
    "update private.read_windows set window_start=clock_timestamp()+interval '1 minute'",
  );
  await expect(read(null)).rejects.toMatchObject({ code: 'PT429' });
});
