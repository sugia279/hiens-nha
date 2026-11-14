import {
  validateRequest,
  requestStatuses,
} from '../../supabase/functions/_shared/domain/requests.mjs';
import { stableId, checksum, entityForPath } from './comments-model.mjs';
export function planRequestsImport({ archives, base, sourceCommit }) {
  const seen = new Set();
  const records = archives.map((raw) => {
    if (
      raw.version !== 1 ||
      !Number.isSafeInteger(raw.number) ||
      raw.number < 1 ||
      seen.has(raw.number)
    )
      throw new Error('Invalid or duplicate legacy request');
    seen.add(raw.number);
    const payload = validateRequest(raw.request);
    if (
      !payload ||
      !requestStatuses.includes(raw.status) ||
      typeof raw.result !== 'string' ||
      (raw.status === 'completed' && !raw.result.trim()) ||
      !Array.isArray(raw.timeline) ||
      ![
        raw.createdAt,
        raw.updatedAt,
        ...raw.timeline.flatMap((e) => [e.createdAt, e.updatedAt]),
      ].every((t) => typeof t === 'string' && Number.isFinite(Date.parse(t)))
    )
      throw new Error('Legacy request needs explicit lossless mapping');
    if (
      raw.timeline.some(
        (e) =>
          !requestStatuses.includes(e.status) ||
          typeof e.message !== 'string' ||
          typeof e.result !== 'string',
      )
    )
      throw new Error('Invalid legacy timeline');
    return {
      id: stableId(`github:request:${raw.number}`),
      entity: entityForPath(`${base}requests/${raw.number}/`, base),
      payload,
      raw,
      checksum: checksum(raw),
    };
  });
  return { records, sourceCommit, checksum: checksum(records) };
}
export async function applyRequestsPlan(db, plan) {
  let changed = 0;
  await db.query('begin');
  try {
    if (
      (
        await db.query(
          "select 1 from private.feature_controls where feature='requests' and (source<>'git' or writes_enabled)",
        )
      ).rows.length
    )
      throw new Error('Freeze API request writes before legacy import');
    for (const r of plan.records) {
      const key = String(r.raw.number),
        previous = (
          await db.query(
            "select * from private.feature_imports where feature='requests' and legacy_key=$1",
            [key],
          )
        ).rows[0];
      if (previous) {
        if (previous.checksum === r.checksum) continue;
        throw new Error(
          'Changed legacy snapshot requires explicit delta review',
        );
      }
      const e = r.entity;
      await db.query(
        'insert into public.content_entities(id,collection,legacy_key,canonical_path) values($1,$2,$3,$4) on conflict(id) do nothing',
        [e.id, e.collection, e.legacy_key, e.canonical_path],
      );
      const publicState = r.raw.approved ? 'approved' : 'pending';
      const accepted = [
        'accepted',
        'in-progress',
        'waiting',
        'completed',
      ].includes(r.raw.status)
        ? 1
        : null;
      await db.query(
        'insert into private.help_requests(id,entity_id,author_id,version,scope_revision,accepted_scope_revision,moderation,status,result,legacy_number,created_at,updated_at,deleted_at) values($1,$2,null,$3,1,$4,$5,$6,$7,$8,$9,$10,$11)',
        [
          r.id,
          e.id,
          r.raw.timeline.length + 1,
          accepted,
          publicState,
          r.raw.status,
          r.raw.result,
          r.raw.number,
          r.raw.createdAt,
          r.raw.updatedAt,
          r.raw.deleted ? r.raw.updatedAt : null,
        ],
      );
      const p = r.payload;
      await db.query(
        'insert into private.request_scope_revisions values($1,1,$2,$3,$4,$5,$6,$7,null,$8)',
        [
          r.id,
          p.title,
          p.description,
          p.expectedResult,
          p.category,
          p.priority,
          p.tags,
          r.raw.createdAt,
        ],
      );
      const events = [
        {
          status: 'new',
          message:
            'Legacy request snapshot imported; historical scope details retained in private evidence',
          result: '',
          updatedAt: r.raw.createdAt,
        },
        ...r.raw.timeline,
      ];
      for (const [i, event] of events.entries())
        await db.query(
          "insert into private.request_events(id,request_id,version,scope_revision,actor_id,action,status_after,message,result,created_at) values($1,$2,$3,1,null,'legacy-snapshot',$4,$5,$6,$7)",
          [
            stableId(`github:request:${key}:event:${i}`),
            r.id,
            i + 1,
            event.status,
            event.message,
            event.result,
            event.updatedAt,
          ],
        );
      await db.query(
        "insert into public.legacy_mappings values('github-request',$1,$2)",
        [key, e.id],
      );
      await db.query(
        "insert into private.feature_imports values('requests',$1,$2,$3,$4,$5::jsonb)",
        [key, r.id, r.checksum, plan.sourceCommit, JSON.stringify(r.raw)],
      );
      changed++;
    }
    await db.query('commit');
    return { changed };
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}
export async function reconcileRequests(db, plan) {
  await db.query('set role anon');
  try {
    const data = (
      await db.query('select public.request_read(p_limit=>51) as data')
    ).rows[0].data;
    const expected = plan.records.filter(
      (r) => r.raw.approved && !r.raw.deleted,
    );
    for (const r of expected) {
      const actual = data.find((a) => a.id === r.id);
      if (
        !actual ||
        (JSON.stringify(actual.payload) !== JSON.stringify(r.payload) &&
          checksum(actual.payload) !== checksum(r.payload)) ||
        actual.status !== r.raw.status ||
        actual.result !== r.raw.result
      )
        throw new Error('Legacy request public projection mismatch');
    }
    for (const r of plan.records.filter(
      (r) => !r.raw.approved || r.raw.deleted,
    ))
      if (data.some((a) => a.id === r.id))
        throw new Error('Private legacy request leaked');
    return { publicRecords: expected.length, matches: true };
  } finally {
    await db.query('reset role');
  }
}
