import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDatabase } from './helpers/database';
import {
  planRequestsImport,
  applyRequestsPlan,
  reconcileRequests,
} from '../../scripts/migration/requests-model.mjs';
const raw = {
  version: 1,
  number: 14,
  approved: true,
  deleted: false,
  request: {
    title: 'Imported request',
    description: 'A legacy description',
    expectedResult: 'A useful result',
    category: 'other',
    priority: 'normal',
    tags: ['a'],
  },
  status: 'completed',
  result: 'Confirmed output',
  timeline: [
    {
      id: 1,
      status: 'completed',
      message: 'Old owner message',
      result: 'Confirmed output',
      createdAt: '2026-11-13T01:00:00Z',
      updatedAt: '2026-11-13T02:00:00Z',
    },
  ],
  author: 'same-login',
  createdAt: '2026-11-13T00:00:00Z',
  updatedAt: '2026-11-13T02:00:00Z',
};
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
}, 30000);
afterAll(async () => {
  await db.close();
});
describe('legacy Requests bridge rehearsal', () => {
  it('retains raw evidence/history, null ownership, visibility and stable old bookmarks on rerun', async () => {
    const plan = planRequestsImport({
      archives: [
        raw,
        { ...raw, number: 15, approved: false },
        { ...raw, number: 16, deleted: true },
      ],
      base: '/hiens-nha/',
      sourceCommit: 'fixture',
    });
    expect(await applyRequestsPlan(db, plan)).toEqual({ changed: 3 });
    expect(await applyRequestsPlan(db, plan)).toEqual({ changed: 0 });
    expect(await reconcileRequests(db, plan)).toEqual({
      publicRecords: 1,
      matches: true,
    });
    await db.exec('set role anon');
    try {
      const visible = (
        await db.query<{ r: any }>('select public.request_legacy(14) as r')
      ).rows[0]!.r;
      expect(visible.author_id).toBeNull();
      expect(visible).toMatchObject({
        status: 'completed',
        result: raw.result,
        accepted_scope_revision: 1,
      });
      expect(
        (
          await db.query<{ r: any }>('select public.request_history($1) as r', [
            visible.id,
          ])
        ).rows[0]!.r.some((e: any) => e.message === 'Old owner message'),
      ).toBe(true);
      for (const number of [15, 16])
        await expect(
          db.query('select public.request_legacy($1)', [number]),
        ).rejects.toMatchObject({ code: 'PT404' });
    } finally {
      await db.exec('reset role');
    }
    await expect(
      applyRequestsPlan(
        db,
        planRequestsImport({
          archives: [{ ...raw, result: 'Changed snapshot' }],
          base: '/hiens-nha/',
          sourceCommit: 'delta',
        }),
      ),
    ).rejects.toThrow('delta review');
    await db.exec(
      "update private.feature_controls set source='api',writes_enabled=true where feature='requests'",
    );
    await expect(applyRequestsPlan(db, plan)).rejects.toThrow('Freeze');
  });
});
