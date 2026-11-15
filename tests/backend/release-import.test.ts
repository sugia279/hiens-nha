import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDatabase } from './helpers/database';
import {
  planPublicationsImport,
  applyPublicationsPlan,
  reconcilePublications,
} from '../../scripts/migration/publications-model.mjs';
import {
  changeControl,
  controls,
} from '../../scripts/backend/control-model.mjs';
const A = '10000000-0000-0000-0000-000000000001',
  O = '10000000-0000-0000-0000-000000000003';
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
  for (const id of [A, O])
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
const payload = {
  title: 'Legacy poem',
  body: 'One\nTwo',
  kind: 'poem',
  category: 'Poetry',
  tags: ['tag'],
  series: 'Legacy shared',
  order: 7,
};
const plan = (
  feature = 'posts',
  archives: Array<{ key: string; raw: Record<string, any> }> = [
    {
      key: 'hand-authored.json',
      raw: {
        version: 1,
        number: 0,
        approved: true,
        deleted: false,
        knowledge: payload,
      },
    },
    {
      key: 'pending.json',
      raw: {
        version: 1,
        approved: false,
        deleted: false,
        knowledge: { ...payload, series: '', order: 9 },
      },
    },
    {
      key: 'deleted.json',
      raw: { version: 1, deleted: true, knowledge: null },
    },
  ],
) =>
  planPublicationsImport({
    feature,
    archives,
    base: '/hiens-nha/',
    sourceCommit: 'fixture',
    snapshotAt: '2026-11-15T00:00:00Z',
  });
describe('release import and control gates', () => {
  it('imports shared legacy series without granting ownership, preserves tombstones and order, reruns unchanged', async () => {
    const p = plan();
    expect(await applyPublicationsPlan(db, p)).toEqual({ changed: 3 });
    expect(await applyPublicationsPlan(db, p)).toEqual({ changed: 0 });
    expect(await reconcilePublications(db, p)).toEqual({
      publicRecords: 1,
      matches: true,
    });
    expect(
      (await db.query('select author_id,legacy_namespace from private.series'))
        .rows,
    ).toEqual([{ author_id: null, legacy_namespace: 'shared-knowledge-v1' }]);
    expect(
      (
        await db.query(
          'select sort_order from private.publication_revisions order by sort_order',
        )
      ).rows,
    ).toEqual([{ sort_order: 7 }, { sort_order: 9 }]);
    expect(
      (
        await db.query<{ n: number }>(
          'select count(*)::int n from private.legacy_tombstones',
        )
      ).rows[0]!.n,
    ).toBe(1);
    await db.exec('set role anon');
    try {
      expect(
        (
          await db.query('select * from public.content_entities where id=$1', [
            p.records[2]!.id,
          ])
        ).rows,
      ).toEqual([]);
    } finally {
      await db.exec('reset role');
    }
    await expect(
      applyPublicationsPlan(
        db,
        plan('posts', [
          {
            key: 'hand-authored.json',
            raw: {
              ...p.records[0]!.raw,
              knowledge: { ...payload, body: 'Changed' },
            },
          },
        ]),
      ),
    ).rejects.toThrow('delta review');
  });
  it('rejects colliding legacy positions and preserves original media source URL plus canonical provider', async () => {
    expect(() =>
      plan('posts', [
        { key: 'a', raw: { version: 1, knowledge: payload } },
        { key: 'b', raw: { version: 1, knowledge: payload } },
      ]),
    ).toThrow('series position');
    const p = plan('media', [
      {
        key: 'issue-17.json',
        raw: {
          version: 1,
          approved: true,
          deleted: false,
          media: {
            title: 'Old video',
            description: 'Desc',
            category: 'music',
            url: 'https://www.facebook.com/share/v/1J6iFA7d3k/',
          },
        },
      },
    ]);
    await applyPublicationsPlan(db, p);
    expect(await reconcilePublications(db, p)).toEqual({
      publicRecords: 1,
      matches: true,
    });
  });
  it('freezes writes without removing public reads and refuses a stale Git rollback after an API write', async () => {
    let state = (await controls(db)).find((s: any) => s.feature === 'posts')!;
    await changeControl(db, {
      feature: 'posts',
      expected: state,
      next: { source: 'api', epoch: 1, writes_enabled: true },
      reason: 'Local rehearsal',
    });
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [A]);
    let created: any;
    try {
      created = (
        await db.query<{ data: any }>(
          "select public.publication_write(p_feature=>'posts',p_action=>'create',p_payload=>$1::jsonb,p_key=>$2) data",
          [
            JSON.stringify({ ...payload, series: '', order: 8 }),
            crypto.randomUUID(),
          ],
        )
      ).rows[0]!.data;
      expect(created.payload.order).toBe(8);
    } finally {
      await db.exec('reset role');
    }
    state = (await controls(db)).find((s: any) => s.feature === 'posts')!;
    await changeControl(db, {
      feature: 'posts',
      expected: state,
      next: { source: 'api', epoch: 1, writes_enabled: false },
      reason: 'Maintenance',
    });
    state = (await controls(db)).find((s: any) => s.feature === 'posts')!;
    await expect(
      changeControl(db, {
        feature: 'posts',
        expected: state,
        next: { source: 'git', epoch: 2, writes_enabled: false },
        reason: 'Unsafe rollback',
      }),
    ).rejects.toThrow('API writes exist');
    await expect(applyPublicationsPlan(db, plan())).rejects.toThrow('Freeze');
    await db.exec('set role authenticated');
    try {
      await expect(
        db.query(
          "select public.publication_write(p_feature=>'posts',p_action=>'save',p_id=>$1,p_expected_version=>1,p_payload=>$2::jsonb,p_key=>$3)",
          [
            created.id,
            JSON.stringify({ ...payload, series: '' }),
            crypto.randomUUID(),
          ],
        ),
      ).rejects.toMatchObject({ code: 'PT503' });
    } finally {
      await db.exec('reset role');
    }
    expect(await reconcilePublications(db, plan())).toEqual({
      publicRecords: 1,
      matches: true,
    });
    await expect(
      changeControl(db, {
        feature: 'posts',
        expected: { ...state, epoch: 0 },
        next: { source: 'api', epoch: 1, writes_enabled: true },
        reason: 'stale',
      }),
    ).rejects.toThrow('conflict');
  });
});
