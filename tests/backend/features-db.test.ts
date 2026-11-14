import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDatabase } from './helpers/database';
import { validateMedia } from '../../src/lib/media-links.mjs';
const A = '10000000-0000-0000-0000-000000000001',
  B = '10000000-0000-0000-0000-000000000002',
  O = '10000000-0000-0000-0000-000000000003';
let db: Awaited<ReturnType<typeof testDatabase>>;
const post = {
  title: 'Bài thơ thử nghiệm',
  body: 'Dòng một\nDòng hai',
  kind: 'poem',
  category: 'Thơ',
  tags: ['thơ', 'thơ'],
  series: 'Chuỗi thử',
  order: 1,
};
const request = {
  title: 'Nhờ hỗ trợ',
  description: 'Mô tả công việc cần hỗ trợ',
  expectedResult: 'Tài liệu hướng dẫn',
  category: 'technology',
  priority: 'normal',
  tags: ['test'],
};
async function as<T = Record<string, unknown>>(
  user: string | null,
  query: string,
  args: unknown[] = [],
) {
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    user ?? '',
  ]);
  try {
    return (await db.query<T>(query, args)).rows;
  } finally {
    await db.exec('reset role');
  }
}
async function rpc(
  user: string | null,
  name: string,
  args: Record<string, unknown>,
) {
  const fields = Object.keys(args);
  const params = Object.values(args).map((v) =>
    v && typeof v === 'object' ? JSON.stringify(v) : v,
  );
  return (
    await as<{ data: any }>(
      user,
      `select public.${name}(${fields.map((f, i) => f + '=> $' + (i + 1)).join(',')}) as data`,
      params,
    )
  )[0]!.data;
}
const pub = (
  user: string,
  action: string,
  id: string | null = null,
  version: number | null = null,
  payload: unknown = null,
  extra: Record<string, unknown> = {},
) =>
  rpc(user, 'publication_write', {
    p_feature: 'posts',
    p_action: action,
    p_id: id,
    p_expected_version: version,
    p_payload: payload,
    p_key: crypto.randomUUID(),
    ...extra,
  });
const req = (
  user: string,
  action: string,
  id: string | null = null,
  version: number | null = null,
  scope: number | null = null,
  extra: Record<string, unknown> = {},
) =>
  rpc(user, 'request_write', {
    p_action: action,
    p_id: id,
    p_expected_version: version,
    p_scope_revision: scope,
    p_key: crypto.randomUUID(),
    ...extra,
  });
beforeAll(async () => {
  db = await testDatabase();
  for (const id of [A, B, O])
    await db.query('insert into auth.users values($1,\'{"role":"owner"}\')', [
      id,
    ]);
  await db.query(
    "insert into public.role_assignments(user_id,role) values($1,'owner')",
    [O],
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
describe('phase 3/4 DB authority', () => {
  it('fresh controls default to Git, deny all direct tables and bootstrap no metadata owner', async () => {
    await expect(pub(A, 'create', null, null, post)).rejects.toMatchObject({
      code: 'PT503',
    });
    const tables = (
      await db.query<{ relname: string; relrowsecurity: boolean }>(
        "select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and relkind='r'",
      )
    ).rows;
    expect(tables.every((t) => t.relrowsecurity)).toBe(true);
    for (const actor of [null, A, O])
      for (const table of [
        'publications',
        'publication_revisions',
        'help_requests',
        'request_events',
        'feature_controls',
        'feature_receipts',
      ])
        await expect(
          as(actor, `select * from private.${table}`),
        ).rejects.toMatchObject({ code: '42501' });
    expect(await as(A, 'select * from public.role_assignments')).toEqual([]);
    await db.exec(
      "update private.feature_controls set source='api',epoch=1,writes_enabled=true;update private.backend_settings set comments_source='api',comments_epoch=1,comments_writes_enabled=true",
    );
  });
  it('drafts are private, create retries dedupe, only owner reviews exact revision', async () => {
    const key = crypto.randomUUID();
    const args = {
      p_feature: 'posts',
      p_action: 'create',
      p_payload: post,
      p_key: key,
    };
    const p = await rpc(A, 'publication_write', args);
    expect((await rpc(A, 'publication_write', args)).id).toBe(p.id);
    await expect(
      rpc(B, 'publication_write', {
        ...args,
        p_key: key,
        p_payload: { ...post, title: 'Different author', series: '' },
      }),
    ).resolves.toBeTruthy();
    await expect(
      rpc(A, 'publication_read', { p_feature: 'posts', p_id: p.id }),
    ).rejects.toMatchObject({ code: 'PT404' });
    await expect(
      rpc(B, 'publication_read', {
        p_feature: 'posts',
        p_id: p.id,
        p_view: 'working',
      }),
    ).rejects.toMatchObject({ code: 'PT403' });
    await expect(pub(B, 'save', p.id, 1, post)).rejects.toMatchObject({
      code: 'PT403',
    });
    const submitted = await pub(A, 'submit', p.id, 1);
    await expect(
      pub(A, 'approve', p.id, submitted.version, null, {
        p_revision: 1,
        p_reason: 'self',
      }),
    ).rejects.toMatchObject({ code: 'PT403' });
    const approved = await pub(O, 'approve', p.id, submitted.version, null, {
      p_revision: 1,
      p_reason: 'reviewed',
    });
    expect(
      (await rpc(null, 'publication_read', { p_feature: 'posts', p_id: p.id }))
        .payload.body,
    ).toBe(post.body);
    const edited = await pub(A, 'save', p.id, approved.version, {
      ...post,
      body: 'NEW PRIVATE REVISION',
    });
    const old = await rpc(null, 'publication_read', {
      p_feature: 'posts',
      p_id: p.id,
    });
    expect(JSON.stringify(old)).not.toContain('NEW PRIVATE');
    expect(old.payload.body).toBe(post.body);
    const next = await pub(A, 'submit', p.id, edited.version);
    await expect(
      pub(O, 'approve', p.id, next.version, null, {
        p_revision: 1,
        p_reason: 'stale revision',
      }),
    ).rejects.toMatchObject({ code: 'PT409' });
    await pub(O, 'reject', p.id, next.version, null, {
      p_revision: 2,
      p_reason: 'needs work',
    });
    expect(
      (await rpc(null, 'publication_read', { p_feature: 'posts', p_id: p.id }))
        .payload.body,
    ).toBe(post.body);
    expect((await rpc(A, 'publication_history', { p_id: p.id })).length).toBe(
      2,
    );
  });
  it('series names are scoped by author and duplicate active positions roll back', async () => {
    const a = await pub(A, 'create', null, null, {
      ...post,
      series: 'Shared name',
      order: 1,
    });
    const b = await pub(B, 'create', null, null, {
      ...post,
      series: 'Shared name',
      order: 1,
    });
    expect(a.payload.seriesId).not.toBe(b.payload.seriesId);
    const count = (await db.query('select count(*) from private.publications'))
      .rows;
    await expect(
      pub(A, 'create', null, null, {
        ...post,
        series: 'Shared name',
        order: 1,
      }),
    ).rejects.toMatchObject({ code: 'PT409' });
    expect(
      (await db.query('select count(*) from private.publications')).rows,
    ).toEqual(count);
  });
  it('media SQL canonicalization matches reused URL validator and rejects unsafe source directly', async () => {
    for (const url of [
      'https://youtu.be/l5WuCFObGGQ',
      'https://www.youtube.com/watch?si=x&v=l5WuCFObGGQ',
      'https://youtube.com/shorts/l5WuCFObGGQ',
      'https://www.facebook.com/share/v/1J6iFA7d3k/',
      'https://fb.watch/abcd/',
    ]) {
      const input = {
        title: 'Video test',
        description: 'plain <iframe>text</iframe>',
        category: 'video',
        tags: ['a'],
        url,
      };
      const item = await rpc(A, 'publication_write', {
        p_feature: 'media',
        p_action: 'create',
        p_payload: input,
        p_key: crypto.randomUUID(),
      });
      expect(item.payload.url).toBe(validateMedia(input)!.url);
      expect(item.payload.sourceUrl).toBe(url);
    }
    for (const url of [
      'javascript:alert(1)',
      'https://youtube.com.evil.test/watch?v=l5WuCFObGGQ',
      'https://user@youtube.com/watch?v=l5WuCFObGGQ',
    ])
      await expect(
        rpc(A, 'publication_write', {
          p_feature: 'media',
          p_action: 'create',
          p_payload: {
            title: 'Bad video',
            description: '',
            category: 'video',
            url,
            tags: [],
          },
          p_key: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'PT422' });
  });
  it('dynamic draft entities and their discussions are not public', async () => {
    const draft = await pub(A, 'create', null, null, { ...post, series: '' });
    expect(
      await as(null, 'select id from public.content_entities where id=$1', [
        draft.entity_id,
      ]),
    ).toEqual([]);
    await expect(
      rpc(B, 'create_comment', {
        p_entity_id: draft.entity_id,
        p_body: 'forged',
        p_key: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'PT404' });
  });
  it('approval differs from acceptance; completed requires a result and accepted scope', async () => {
    let r = await req(A, 'create', null, null, null, { p_payload: request });
    await expect(rpc(B, 'request_read', { p_id: r.id })).rejects.toMatchObject({
      code: 'PT404',
    });
    await expect(
      req(A, 'transition', r.id, r.version, 1, {
        p_status: 'accepted',
        p_message: 'forged',
      }),
    ).rejects.toMatchObject({ code: 'PT403' });
    r = await req(O, 'moderate', r.id, r.version, 1, {
      p_status: 'approved',
      p_message: 'publish',
    });
    expect(r.status).toBe('new');
    expect(r.accepted_scope_revision).toBeNull();
    await expect(
      req(O, 'transition', r.id, r.version, 1, {
        p_status: 'completed',
        p_message: 'skip acceptance',
        p_result: 'fake',
      }),
    ).rejects.toMatchObject({ code: 'PT422' });
    r = await req(O, 'transition', r.id, r.version, 1, {
      p_status: 'accepted',
      p_message: 'accept scope',
    });
    await expect(
      req(O, 'transition', r.id, r.version, 1, {
        p_status: 'completed',
        p_message: 'done',
        p_result: '',
      }),
    ).rejects.toMatchObject({ code: 'PT422' });
    r = await req(O, 'transition', r.id, r.version, 1, {
      p_status: 'completed',
      p_message: 'done',
      p_result: 'Verified result',
    });
    const completedVersion = r.version;
    r = await req(A, 'scope', r.id, r.version, 1, {
      p_payload: {
        ...request,
        description: 'A changed scope requiring new acceptance',
      },
    });
    expect(r).toMatchObject({
      status: 'new',
      scope_revision: 2,
      accepted_scope_revision: null,
      result: '',
      moderation: 'approved',
    });
    await expect(
      req(O, 'transition', r.id, completedVersion, 1, {
        p_status: 'completed',
        p_message: 'stale',
        p_result: 'wrong scope',
      }),
    ).rejects.toMatchObject({ code: 'PT409' });
    let events = await rpc(A, 'request_history', { p_id: r.id });
    expect(events.some((e: any) => e.result === 'Verified result')).toBe(true);
    r = await req(O, 'transition', r.id, r.version, 2, {
      p_status: 'accepted',
      p_message: 'accept changed scope',
    });
    r = await req(A, 'scope', r.id, r.version, 2, { p_payload: r.payload });
    expect(r.status).toBe('accepted');
    expect(r.scope_revision).toBe(2);
    const target = events.find((e: any) => e.action === 'transition').id;
    const before = await rpc(A, 'request_history', { p_id: r.id });
    r = await req(O, 'correction', r.id, r.version, 2, {
      p_target: target,
      p_message: 'Correction note without rewriting history',
    });
    events = await rpc(A, 'request_history', { p_id: r.id });
    expect(events.length).toBe(before.length + 1);
    expect(events.find((e: any) => e.id === target)).toEqual(
      before.find((e: any) => e.id === target),
    );
    expect(r.status).toBe('accepted');
  });
});
