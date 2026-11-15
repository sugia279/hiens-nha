import { validateKnowledge } from '../../supabase/functions/_shared/domain/knowledge-submissions.mjs';
import { validateMedia } from '../../supabase/functions/_shared/domain/media-links.mjs';
import { stableId, checksum } from './comments-model.mjs';
export function planPublicationsImport({
  feature,
  archives,
  base,
  sourceCommit,
  snapshotAt,
}) {
  if (
    !['posts', 'media'].includes(feature) ||
    !Number.isFinite(Date.parse(snapshotAt))
  )
    throw new Error('Explicit feature/snapshot timestamp required');
  const seen = new Set(),
    slots = new Set();
  const records = archives.map(({ key, raw }) => {
    if (raw.version !== 1 || typeof key !== 'string' || !key || seen.has(key))
      throw new Error('Invalid/duplicate publication archive');
    seen.add(key);
    const payload = raw.deleted
      ? null
      : feature === 'posts'
        ? validateKnowledge(raw.knowledge)
        : validateMedia(raw.media);
    if (!raw.deleted && !payload)
      throw new Error('Invalid legacy publication requires explicit mapping');
    const sourceUrl =
      feature === 'media' && !raw.deleted ? raw.media.url.trim() : null;
    const id = stableId(`legacy:${feature}:${key}`),
      seriesId = payload?.series
        ? stableId(`legacy:shared-knowledge-v1:${payload.series}`)
        : null;
    if (seriesId) {
      const slot = seriesId + ':' + payload.order;
      if (slots.has(slot))
        throw new Error('Conflicting legacy series position requires review');
      slots.add(slot);
    }
    const createdAt = raw.createdAt ?? snapshotAt,
      updatedAt = raw.updatedAt ?? snapshotAt;
    if (![createdAt, updatedAt].every((v) => Number.isFinite(Date.parse(v))))
      throw new Error('Invalid archive timestamp');
    return {
      id,
      key,
      raw,
      payload,
      sourceUrl,
      seriesId,
      createdAt,
      updatedAt,
      checksum: checksum(raw),
      entity: {
        id,
        collection: 'page',
        legacy_key: `${feature}:${id}`,
        canonical_path: `${base}community/${feature === 'posts' ? 'post' : 'media'}/?id=${id}`,
      },
    };
  });
  return {
    feature,
    records,
    sourceCommit,
    snapshotAt,
    checksum: checksum({ feature, records, sourceCommit, snapshotAt }),
  };
}
export async function applyPublicationsPlan(db, plan) {
  await db.query('begin');
  let changed = 0;
  try {
    const setting = (
      await db.query(
        'select * from private.feature_controls where feature=$1 for update',
        [plan.feature],
      )
    ).rows[0];
    if (!setting || setting.source !== 'git' || setting.writes_enabled)
      throw new Error(
        'Freeze Git feature and disable API writes before import',
      );
    if (
      (
        await db.query(
          "select 1 from private.publication_events e join private.publications p on p.id=e.publication_id where p.feature=$1 and e.action<>'import' limit 1",
          [plan.feature],
        )
      ).rows.length
    )
      throw new Error(
        'API writes exist; reconcile private delta before import',
      );
    for (const r of plan.records) {
      const previous = (
        await db.query(
          'select checksum from private.feature_imports where feature=$1 and legacy_key=$2',
          [plan.feature, r.key],
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
        'insert into public.content_entities(id,collection,legacy_key,canonical_path) values($1,$2,$3,$4)',
        [e.id, e.collection, e.legacy_key, e.canonical_path],
      );
      if (r.raw.deleted)
        await db.query(
          'insert into private.legacy_tombstones values($1,$2,$3,$4)',
          [plan.feature, r.key, r.id, e.id],
        );
      else {
        const p = r.payload;
        if (r.seriesId)
          await db.query(
            "insert into private.series(id,author_id,name,legacy_namespace) values($1,null,$2,'shared-knowledge-v1') on conflict(id) do nothing",
            [r.seriesId, p.series],
          );
        await db.query(
          'insert into private.categories values($1,$2) on conflict do nothing',
          [plan.feature, p.category],
        );
        await db.query(
          'insert into private.publications(id,entity_id,feature,author_id,published_revision,created_at,updated_at) values($1,$1,$2,null,$3,$4,$5)',
          [
            r.id,
            plan.feature,
            r.raw.approved ? 1 : null,
            r.createdAt,
            r.updatedAt,
          ],
        );
        await db.query(
          'insert into private.publication_revisions(publication_id,feature,revision,actor_id,title,body,content_type,category,tags,series_id,position,source_url,canonical_url,provider,moderation,created_at,sort_order) values($1,$2,1,null,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',
          [
            r.id,
            plan.feature,
            p.title,
            plan.feature === 'posts' ? p.body : p.description,
            plan.feature === 'posts' ? p.kind : p.category,
            p.category,
            p.tags,
            r.seriesId,
            r.seriesId ? p.order : null,
            r.sourceUrl,
            plan.feature === 'media' ? p.url : null,
            plan.feature === 'media' ? p.platform : null,
            r.raw.approved ? 'approved' : 'pending',
            r.createdAt,
            p.order ?? 1,
          ],
        );
        for (const tag of p.tags) {
          await db.query(
            'insert into private.tags values($1) on conflict do nothing',
            [tag],
          );
          await db.query('insert into private.revision_tags values($1,1,$2)', [
            r.id,
            tag,
          ]);
        }
        if (r.seriesId)
          await db.query('insert into private.series_slots values($1,$2,$3)', [
            r.seriesId,
            p.order,
            r.id,
          ]);
        await db.query(
          "insert into private.publication_events(publication_id,actor_id,action,version,revision,reason,created_at) values($1,null,'import',1,1,'Legacy provenance retained; no author claim',$2)",
          [r.id, r.updatedAt],
        );
      }
      await db.query(
        'insert into private.feature_imports values($1,$2,$3,$4,$5,$6::jsonb)',
        [
          plan.feature,
          r.key,
          r.id,
          r.checksum,
          plan.sourceCommit,
          JSON.stringify(r.raw),
        ],
      );
      await db.query('insert into public.legacy_mappings values($1,$2,$3)', [
        'legacy-' + plan.feature,
        r.key,
        e.id,
      ]);
      changed++;
    }
    await db.query('commit');
    return { changed };
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}
export async function reconcilePublications(db, plan) {
  await db.query('begin');
  let count = 0;
  try {
    await db.query('set local role anon');
    await db.query("select set_config('request.jwt.claim.sub','',true)");
    for (const r of plan.records) {
      if (r.raw.approved && !r.raw.deleted) {
        const row = (
          await db.query(
            'select public.publication_read(p_feature=>$1,p_id=>$2) as data',
            [plan.feature, r.id],
          )
        ).rows[0].data;
        const { seriesId, ...actual } = row.payload;
        if (plan.feature === 'media') {
          delete actual.sourceUrl;
          if (row.payload.sourceUrl !== r.sourceUrl)
            throw new Error('Source URL lost');
        }
        if (checksum(actual) !== checksum(r.payload) || row.author_id !== null)
          throw new Error('Publication public projection differs from legacy');
        count++;
      } else {
        const rows = (
          await db.query(
            "select public.publication_read(p_feature=>$1,p_view=>'public',p_limit=>51) as data",
            [plan.feature],
          )
        ).rows[0].data;
        if (rows.some((p) => p.id === r.id))
          throw new Error('Private/deleted publication leaked');
      }
    }
    await db.query('commit');
    return { publicRecords: count, matches: true };
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}
