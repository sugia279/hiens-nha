import { it, expect } from 'vitest';
import { testDatabase } from './helpers/database';
import { cleanupLoadRows } from '../../scripts/backend/load-cleanup.mjs';
it('cleans only synthetic relational graphs, including comment receipts and owner moderation FKs', async () => {
  const db = await testDatabase(),
    A = '10000000-0000-0000-0000-000000000001',
    O = '10000000-0000-0000-0000-000000000002',
    E = '20000000-0000-0000-0000-000000000001';
  try {
    for (const id of [A, O])
      await db.query("insert into auth.users values($1,'{}')", [id]);
    await db.query(
      "insert into public.role_assignments(user_id,role) values($1,'owner')",
      [O],
    );
    await db.exec(
      "update private.feature_controls set source='api',epoch=1,writes_enabled=true;update private.backend_settings set comments_source='api',comments_epoch=1,comments_writes_enabled=true",
    );
    await db.query(
      "insert into public.content_entities values($1,'page','cleanup-static','/hiens-nha/cleanup/',now())",
      [E],
    );
    const uid = async (id: string) =>
      db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    const pub = {
      title: 'Cleanup publication',
      body: 'Synthetic content',
      kind: 'note',
      category: 'Ops',
      tags: ['test'],
      series: '',
      order: 1,
    };
    await uid(A);
    const comment = (
      await db.query<{ id: string }>(
        'select * from public.create_comment($1,$2,$3)',
        [E, 'Synthetic comment', crypto.randomUUID()],
      )
    ).rows[0]!;
    const item = (
      await db.query<{ p: any }>(
        "select public.publication_write(p_feature=>'posts',p_action=>'create',p_payload=>$1,p_key=>$2) p",
        [JSON.stringify(pub), crypto.randomUUID()],
      )
    ).rows[0]!.p;
    await db.query(
      "select public.publication_write(p_feature=>'posts',p_action=>'submit',p_id=>$1,p_expected_version=>1,p_key=>$2)",
      [item.id, crypto.randomUUID()],
    );
    await db.query(
      "select public.request_write(p_action=>'create',p_payload=>$1,p_key=>$2)",
      [
        JSON.stringify({
          title: 'Cleanup request',
          description: 'Synthetic request scope',
          expectedResult: 'Safe cleanup',
          category: 'other',
          priority: 'normal',
          tags: [],
        }),
        crypto.randomUUID(),
      ],
    );
    await uid(O);
    await db.query(
      "select public.publication_write(p_feature=>'posts',p_action=>'approve',p_id=>$1,p_revision=>1,p_expected_version=>2,p_reason=>'test',p_key=>$2)",
      [item.id, crypto.randomUUID()],
    );
    await db.query(
      "select * from public.moderate_comment($1,'approved',1,'test')",
      [comment.id],
    );
    const retained = (
      await db.query<{ p: any }>(
        "select public.publication_write(p_feature=>'posts',p_action=>'create',p_payload=>$1,p_key=>$2) p",
        [JSON.stringify(pub), crypto.randomUUID()],
      )
    ).rows[0]!.p;
    expect(await cleanupLoadRows(db, [A], O)).toEqual({
      profiles: 1,
      publications: 1,
      requests: 1,
      comments: 1,
    });
    expect((await db.query('select id from public.profiles')).rows).toEqual([
      { id: O },
    ]);
    expect(
      (await db.query('select id from private.publications')).rows,
    ).toEqual([{ id: retained.id }]);
    expect(
      (
        await db.query('select id from public.content_entities where id=$1', [
          E,
        ])
      ).rows,
    ).toHaveLength(1);
  } finally {
    await db.close();
  }
}, 30000);
