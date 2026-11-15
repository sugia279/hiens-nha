export async function controls(db) {
  return [
    {
      feature: 'comments',
      ...(
        await db.query(
          'select comments_source as source,comments_epoch as epoch,comments_writes_enabled as writes_enabled from private.backend_settings where singleton',
        )
      ).rows[0],
    },
    ...(
      await db.query('select * from private.feature_controls order by feature')
    ).rows,
  ];
}
export async function apiWritten(db, feature) {
  const query =
    feature === 'comments'
      ? "select 1 from public.audit_events where action in ('create','edit','delete','moderate') limit 1"
      : feature === 'requests'
        ? "select 1 from private.request_events where action<>'legacy-snapshot' limit 1"
        : "select 1 from private.publication_events e join private.publications p on p.id=e.publication_id where p.feature=$1 and e.action<>'import' limit 1";
  return (
    (
      await db.query(
        query,
        ['posts', 'media'].includes(feature) ? [feature] : [],
      )
    ).rows.length > 0
  );
}
export async function changeControl(db, { feature, expected, next, reason }) {
  if (
    !['comments', 'posts', 'media', 'requests'].includes(feature) ||
    !reason?.trim() ||
    reason.length > 500 ||
    !['git', 'api'].includes(next.source) ||
    !Number.isSafeInteger(next.epoch) ||
    next.epoch < 0 ||
    typeof next.writes_enabled !== 'boolean' ||
    (next.source === 'git' && next.writes_enabled) ||
    (next.source === 'api' && next.epoch < 1)
  )
    throw new Error('Invalid source control');
  await db.query('begin');
  try {
    await db.query(
      feature === 'comments'
        ? 'select * from private.backend_settings where singleton for update'
        : 'select * from private.feature_controls where feature=$1 for update',
      feature === 'comments' ? [] : [feature],
    );
    const previous = (await controls(db)).find((r) => r.feature === feature);
    for (const key of ['source', 'epoch', 'writes_enabled'])
      if (previous[key] !== expected[key])
        throw new Error('Source/epoch conflict');
    if (
      next.epoch < previous.epoch ||
      (next.source !== previous.source && next.epoch <= previous.epoch)
    )
      throw new Error('Epoch must increase on source change');
    if (next.source === 'git' && (await apiWritten(db, feature)))
      throw new Error(
        'API writes exist: freeze and reconcile private delta; stale Git rollback refused',
      );
    if (feature === 'comments')
      await db.query(
        'update private.backend_settings set comments_source=$1,comments_epoch=$2,comments_writes_enabled=$3 where singleton',
        [next.source, next.epoch, next.writes_enabled],
      );
    else
      await db.query(
        'update private.feature_controls set source=$1,epoch=$2,writes_enabled=$3 where feature=$4',
        [next.source, next.epoch, next.writes_enabled, feature],
      );
    await db.query(
      'insert into private.control_events(feature,previous,next,reason) values($1,$2::jsonb,$3::jsonb,$4)',
      [feature, JSON.stringify(previous), JSON.stringify(next), reason.trim()],
    );
    await db.query('commit');
    return { feature, ...next };
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}
