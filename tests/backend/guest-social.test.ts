import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { testDatabase } from './helpers/database';
const G = '10000000-0000-0000-0000-000000000011',
  H = '10000000-0000-0000-0000-000000000012',
  A = '10000000-0000-0000-0000-000000000001',
  O = '10000000-0000-0000-0000-000000000003',
  E = '20000000-0000-0000-0000-000000000001';
let db: Awaited<ReturnType<typeof testDatabase>>, post: any, draft: any;
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
const create = (actor = G, key = crypto.randomUUID(), entity = E) =>
  as(actor, 'select to_jsonb(public.create_comment($1,$2,$3)) as data', [
    entity,
    '<script>inert</script>',
    key,
  ]);
const react = (actor: string, value: string | null, id = post.id) =>
  as(actor, 'select public.post_reaction_set($1,$2) as data', [id, value]);
const identity = (
  actor = G,
  name: string | null = null,
  choose = false,
  proof: string | null = null,
) =>
  as(actor, 'select public.guest_identity($1,$2,$3) as data', [
    name,
    choose,
    proof,
  ]);
const details = (id = post.id, after: string | null = null, limit = 25) =>
  as(null, 'select public.post_reaction_details($1,$2,$3) as data', [
    id,
    after,
    limit,
  ]);
beforeAll(async () => {
  db = await testDatabase();
  await db.exec(
    'alter table auth.users add column is_anonymous boolean default false',
  );
  for (const id of [G, H, A, O])
    await db.query(
      'insert into auth.users(id,raw_user_meta_data,is_anonymous) values($1,$2,$3)',
      [
        id,
        {
          full_name: id === A ? 'Verified Person' : 'Pretend owner',
          role: 'owner',
          avatar_url: 'https://avatars.githubusercontent.com/u/1',
        },
        [G, H].includes(id),
      ],
    );
  await db.query("insert into public.role_assignments values($1,'owner')", [O]);
  await db.query(
    "insert into public.content_entities(id,collection,legacy_key,canonical_path) values($1,'page','guest-social','/hiens-nha/')",
    [E],
  );
  await db.exec(
    "update private.backend_settings set comments_source='api',comments_epoch=1,comments_writes_enabled=true;update private.feature_controls set source='api',epoch=1,writes_enabled=true",
  );
  const payload = {
    title: 'Fixture',
    body: 'Fixture',
    kind: 'note',
    category: 'Test',
    tags: ['test'],
    series: '',
    order: 1,
  };
  const write = (action: string, row?: any) =>
    as(
      O,
      "select public.publication_write(p_feature=>'posts',p_action=>$1,p_id=>$2,p_payload=>$3,p_expected_version=>$4,p_key=>$5,p_revision=>$6,p_reason=>'Fixture') as data",
      [
        action,
        row?.id ?? null,
        action === 'create' ? payload : null,
        row?.version ?? null,
        crypto.randomUUID(),
        row?.revision ?? null,
      ],
    );
  draft = await write('create');
  post = await write('create');
  post = await write('submit', post);
  post = await write('approve', post);
}, 30000);
beforeEach(async () => {
  await db.exec(
    'delete from private.read_windows;delete from private.write_windows;delete from private.feature_windows',
  );
});
afterAll(async () => {
  await db?.close();
});
it('records a public interaction before a name exists; retries do not duplicate', async () => {
  const key = crypto.randomUUID(),
    c = await create(G, key);
  expect(c.status).toBe('approved');
  expect((await create(G, key)).id).toBe(c.id);
  const page = await as(
    null,
    'select public.read_comments(p_entity_id=>$1) as data',
    [E],
  );
  expect(page.find((r: any) => r.id === c.id)).toMatchObject({
    display_name: 'Người Lạ',
    avatar_url: null,
  });
  expect(await react(G, 'heart')).toMatchObject({ heart: 1, mine: 'heart' });
  expect(await react(G, 'heart')).toMatchObject({ heart: 1 });
  expect(await identity()).toEqual({ display_name: 'Người Lạ', chosen: false });
  expect(await identity(G, '<b>Owner</b>', true)).toEqual({
    display_name: '<b>Owner</b>',
    chosen: true,
  });
  expect((await details()).items).toEqual([
    { display_name: '<b>Owner</b>', avatar_url: null, reaction: 'heart' },
  ]);
  expect(await as(G, 'select public.caller_is_owner() as data')).toBe(false);
});
it('remembers cancellation as an anonymous choice and validates names', async () => {
  expect(await identity(H, null, true)).toEqual({
    display_name: 'Người Lạ',
    chosen: true,
  });
  expect((await identity(H)).chosen).toBe(true);
  for (const name of ['', 'x'.repeat(61), 'bad\nname'])
    await expect(identity(H, name, true)).rejects.toMatchObject({
      code: 'PT422',
    });
  await expect(
    as(null, 'select public.guest_identity() as data'),
  ).rejects.toMatchObject({ code: '42501' });
  await expect(identity(A, 'Forged', true)).rejects.toMatchObject({
    code: 'PT403',
  });
});
it('denies guests publishing, Requests, categories, Storage and private comments through direct RPC', async () => {
  for (const sql of [
    "select public.publication_write('posts','create')",
    "select public.request_write('create')",
    "select public.content_category_create('posts','Unauthorized')",
    "select public.home_profile_save('{}',1)",
  ])
    await expect(as(G, sql)).rejects.toMatchObject({ code: 'PT403' });
  await expect(
    create(G, crypto.randomUUID(), draft.entity_id),
  ).rejects.toMatchObject({ code: 'PT404' });
  await expect(react(G, 'wow', draft.id)).rejects.toMatchObject({
    code: 'PT404',
  });
  await expect(
    as(
      G,
      "insert into storage.objects(bucket_id,name) values('post-images',$1)",
      [G + '/' + crypto.randomUUID() + '.webp'],
    ),
  ).rejects.toMatchObject({ code: '42501' });
  await expect(
    as(G, 'select * from private.guest_profiles'),
  ).rejects.toMatchObject({ code: '42501' });
});
it('enforces author ownership, moderation and quotas for guest comments and reactions', async () => {
  const c = await create(H);
  await expect(
    as(G, "select public.edit_comment($1,'claim',1)", [c.id]),
  ).rejects.toMatchObject({ code: 'PT403' });
  await as(O, "select public.moderate_comment($1,'hidden',1,'Fixture hide')", [
    c.id,
  ]);
  expect(
    await as(H, "select to_jsonb(public.edit_comment($1,'edit',2)) as data", [
      c.id,
    ]),
  ).toMatchObject({ status: 'hidden' });
  await db.query(
    "insert into private.write_windows values($1,date_trunc('minute',statement_timestamp()),30)",
    [G],
  );
  await expect(create()).rejects.toMatchObject({ code: 'PT429' });
  await db.query(
    "insert into private.feature_windows values($1,'posts',date_trunc('minute',statement_timestamp()),30)",
    [G],
  );
  await expect(react(G, 'wow')).rejects.toMatchObject({ code: 'PT429' });
});
it('bounds details, paginates without actor identifiers, and hides private/deleted posts', async () => {
  await react(H, 'laugh');
  await react(A, 'wow');
  const first = await details(post.id, null, 1);
  expect(first.items).toHaveLength(1);
  expect(first.nextCursor).toBeTypeOf('string');
  const second = await details(post.id, first.nextCursor, 1);
  expect(second.items).toHaveLength(1);
  expect(second.items).not.toEqual(first.items);
  const all = await details();
  expect(all.items).toHaveLength(3);
  expect(JSON.stringify(all.items)).not.toMatch(
    /actor_id|author_id|email|token|10000000-/,
  );
  await expect(details(post.id, null, 51)).rejects.toMatchObject({
    code: 'PT422',
  });
  await expect(details(draft.id)).rejects.toMatchObject({ code: 'PT404' });
  await db.query(
    'update private.publications set deleted_at=now() where id=$1',
    [post.id],
  );
  await expect(details()).rejects.toMatchObject({ code: 'PT404' });
  await db.query(
    'update private.publications set deleted_at=null where id=$1',
    [post.id],
  );
});
it('requires possession of the right guest proof, transfers once and prevents duplicate reactions', async () => {
  const retryKey = crypto.randomUUID();
  const c = await create(G, retryKey),
    other = await create(H),
    proof = crypto.randomUUID();
  await identity(G, null, false, proof);
  await expect(
    as(A, 'select public.guest_claim($1)', [crypto.randomUUID()]),
  ).rejects.toMatchObject({ code: 'PT403' });
  await expect(
    as(H, 'select public.guest_claim($1)', [proof]),
  ).rejects.toMatchObject({ code: 'PT403' });
  expect(await as(A, 'select public.guest_claim($1) as data', [proof])).toBe(
    true,
  );
  expect(await as(A, 'select public.guest_claim($1) as data', [proof])).toBe(
    true,
  );
  await expect(
    as(O, 'select public.guest_claim($1)', [proof]),
  ).rejects.toMatchObject({ code: 'PT403' });
  expect(
    (
      await db.query<any>('select author_id from public.comments where id=$1', [
        c.id,
      ])
    ).rows[0].author_id,
  ).toBe(A);
  expect(
    (
      await db.query<any>('select author_id from public.comments where id=$1', [
        other.id,
      ])
    ).rows[0].author_id,
  ).toBe(H);
  expect((await details()).items).toEqual(
    expect.arrayContaining([
      {
        display_name: 'Verified Person',
        avatar_url: 'https://avatars.githubusercontent.com/u/1',
        reaction: 'wow',
      },
    ]),
  );
  expect((await details()).items).toHaveLength(2);
  expect((await create(A, retryKey)).id).toBe(c.id);
  await expect(create(G)).rejects.toMatchObject({ code: 'PT403' });
  await expect(react(G, 'heart')).rejects.toMatchObject({ code: 'PT403' });
  await expect(
    as(G, "select public.edit_comment($1,'old guest',1)", [c.id]),
  ).rejects.toMatchObject({ code: 'PT403' });
});
it('rejects expired handoffs and retains the original interaction', async () => {
  const proof = crypto.randomUUID();
  await identity(H, null, false, proof);
  await db.query(
    "update private.guest_profiles set proof_expires=now()-interval '1 second' where actor_id=$1",
    [H],
  );
  await expect(
    as(A, 'select public.guest_claim($1)', [proof]),
  ).rejects.toMatchObject({ code: 'PT403' });
  expect(await react(H, 'laugh')).toMatchObject({ mine: 'laugh' });
});
