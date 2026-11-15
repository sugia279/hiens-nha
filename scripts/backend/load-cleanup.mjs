export async function cleanupLoadRows(db, ids, ownerId) {
  if (!ids.length) return { profiles: 0 };
  if (ids.includes(ownerId))
    throw new Error('Load identities must exclude the existing owner');
  await db.query('begin');
  try {
    await db.query('set constraints all deferred');
    const values = async (q) =>
      (await db.query(q, [ids])).rows.map((r) => r.id);
    const pubs = await values(
        'select id from private.publications where author_id=any($1::uuid[])',
      ),
      requests = await values(
        'select id from private.help_requests where author_id=any($1::uuid[])',
      ),
      comments = await values(
        'select id from public.comments where author_id=any($1::uuid[])',
      ),
      entities = await values(
        'select entity_id id from private.publications where author_id=any($1::uuid[]) union select entity_id id from private.help_requests where author_id=any($1::uuid[])',
      );
    // Receipts reference comments; remove only this synthetic identity set before its roots.
    await db.query(
      'delete from private.mutation_keys where actor_id=any($1::uuid[])',
      [ids],
    );
    await db.query(
      'delete from private.feature_receipts where actor_id=any($1::uuid[]) or object_id=any($2::uuid[])',
      [ids, [...pubs, ...requests]],
    );
    for (const table of ['audit_events', 'comment_revisions'])
      await db.query(
        `delete from public.${table} where comment_id=any($1::uuid[])`,
        [comments],
      );
    await db.query('delete from public.comments where id=any($1::uuid[])', [
      comments,
    ]);
    for (const table of [
      'publication_events',
      'revision_tags',
      'series_slots',
      'publication_revisions',
    ])
      await db.query(
        `delete from private.${table} where publication_id=any($1::uuid[])`,
        [pubs],
      );
    await db.query(
      'delete from private.publications where id=any($1::uuid[])',
      [pubs],
    );
    for (const table of ['request_events', 'request_scope_revisions'])
      await db.query(
        `delete from private.${table} where request_id=any($1::uuid[])`,
        [requests],
      );
    await db.query(
      'delete from private.help_requests where id=any($1::uuid[])',
      [requests],
    );
    await db.query(
      'delete from public.content_entities where id=any($1::uuid[])',
      [entities],
    );
    for (const table of ['feature_windows', 'write_windows'])
      await db.query(
        `delete from private.${table} where actor_id=any($1::uuid[])`,
        [ids],
      );
    await db.query('delete from public.profiles where id=any($1::uuid[])', [
      ids,
    ]);
    // These counters belong to the explicitly disposable owner fixture, after timed phases only.
    await db.query('delete from private.feature_windows where actor_id=$1', [
      ownerId,
    ]);
    await db.query('delete from private.write_windows where actor_id=$1', [
      ownerId,
    ]);
    await db.query('commit');
    return {
      profiles: ids.length,
      publications: pubs.length,
      requests: requests.length,
      comments: comments.length,
    };
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}
