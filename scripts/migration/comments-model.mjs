import { createHash } from 'node:crypto';
import { canonicalPageContext } from '../../supabase/functions/_shared/page-context.ts';
const namespace = Buffer.from('b2b2943468e94b738045ebf1331d6808', 'hex');
export function stableId(key) {
  const bytes = createHash('sha1').update(namespace).update(key.normalize('NFC')).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex'); return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function ordered(value) { return Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, ordered(value[k])])) : value; }
export const checksum = value => createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex');
export function entityForPath(path, base) {
  const canonical = canonicalPageContext(path, base); if (!canonical) throw new Error('Invalid entity context');
  const logical = canonical.slice(base.length).replace(/\/$/, ''); const match = logical.match(/^(articles|notes|projects|series)\/(.+)$/);
  const collection = match?.[1] ?? 'page'; const key = match?.[2] ?? (logical || 'home');
  return { id: stableId(`entity:${collection}:${key}`), collection, legacy_key: key, canonical_path: canonical };
}
export function planCommentsImport({ paths, archives, base, sourceCommit }) {
  const entities = [...new Map(paths.map(path => { const e = entityForPath(path, base); return [e.id, e]; })).values()];
  const byPath = new Map(entities.map(e => [e.canonical_path, e])); const records = []; const keys = new Set();
  const timestamp = value => { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('Invalid legacy timestamp'); return value; };
  for (const archive of [...archives].sort((a,b) => a.number - b.number)) {
    if (archive.version !== 1 || !Number.isSafeInteger(archive.number) || archive.number < 1) throw new Error('Invalid legacy archive version/number');
    const context = archive.contextPath ?? archive.body?.match(/(?:^|\r?\n)### Page\r?\n([^\r\n]*)/)?.[1]?.trim() ?? '';
    if (archive.deleted && !context) throw new Error(`Deleted archive needs an explicit retained context: ${archive.number}`);
    const canonical = canonicalPageContext(context, base);
    const general = ['', '(general)', '(general guestbook)', '(guestbook-approved)'].includes(context);
    if (!canonical && !general) throw new Error(`Unresolved legacy context for issue ${archive.number}`);
    const entity = byPath.get(canonical ?? `${base}guestbook/`);
    if (!entity) throw new Error(`Unregistered legacy context for issue ${archive.number}`);
    const rootId = stableId(`github:issue:${archive.number}`);
    const add = (key, data, raw) => {
      if (keys.has(key)) throw new Error('Duplicate legacy identity'); keys.add(key);
      if (typeof data.body !== 'string' || (!data.deleted_at && (!data.body.replace(/[ \t\r\n\v\f]/g, '') || [...data.body].length > 4000))) throw new Error(`Legacy text cannot be imported without loss: ${key}`);
      records.push({ ...data, source: 'github-guestbook-v1', key, raw_record: raw, checksum: checksum({ data, raw }) });
    };
    add(`issue:${archive.number}`, { id: rootId, entity_id: entity.id, parent_id: null, body: archive.deleted ? '' : archive.message,
      status: archive.deleted ? 'hidden' : archive.approved ? 'approved' : 'pending', deleted_at: archive.deleted ? timestamp(archive.updatedAt) : null,
      created_at: timestamp(archive.createdAt), updated_at: timestamp(archive.updatedAt), legacy_author_login: String(archive.author?.login ?? ''), legacy_url: String(archive.htmlUrl ?? '') }, archive);
    for (const reply of archive.comments ?? []) {
      if (!Number.isSafeInteger(reply.id) || reply.id < 1) throw new Error('Invalid legacy reply identity');
      add(`comment:${reply.id}`, { id: stableId(`github:comment:${reply.id}`), entity_id: entity.id, parent_id: rootId, body: archive.deleted ? '' : reply.body,
        status: archive.deleted ? 'hidden' : reply.trusted ? 'approved' : 'pending', deleted_at: archive.deleted ? timestamp(archive.updatedAt) : null,
        created_at: timestamp(reply.createdAt), updated_at: timestamp(reply.updatedAt ?? reply.createdAt), legacy_author_login: String(reply.author?.login ?? ''), legacy_url: String(reply.htmlUrl ?? '') }, reply);
    }
  }
  return { version: 1, sourceCommit, entities, records, checksum: checksum({ entities, records, sourceCommit }) };
}
export function publicImportRows(plan) {
  const publicRoots = new Set(plan.records.filter(r => !r.parent_id && r.status === 'approved' && !r.deleted_at).map(r => r.id));
  return plan.records.filter(r => r.status === 'approved' && !r.deleted_at && (!r.parent_id || publicRoots.has(r.parent_id))).map(r => ({ id: r.id, body: r.body, parent_id: r.parent_id, entity_id: r.entity_id })).sort((a,b) => a.id.localeCompare(b.id));
}
export async function applyCommentsPlan(db, plan) {
  await db.query('begin');
  try {
    await db.query("select pg_advisory_xact_lock(hashtextextended('hiens-comments-import',0))");
    const settings = (await db.query('select * from private.backend_settings where singleton for update')).rows[0];
    if (settings.comments_source !== 'git' || settings.comments_writes_enabled) throw new Error('Import requires frozen Git source and disabled API writes');
    if ((await db.query("select 1 from public.audit_events where action in ('create','edit','delete','moderate') limit 1")).rows.length) throw new Error('API writes already exist: reconcile privately before importing');
    for (const e of plan.entities) await db.query('insert into public.content_entities(id,collection,legacy_key,canonical_path) values($1,$2,$3,$4) on conflict(id) do update set canonical_path=excluded.canonical_path', [e.id,e.collection,e.legacy_key,e.canonical_path]);
    let changed = 0;
    for (const r of plan.records) {
      const previous = (await db.query('select checksum from private.legacy_comment_records where source=$1 and key=$2', [r.source,r.key])).rows[0];
      if (previous?.checksum === r.checksum) continue;
      const row = (await db.query(`insert into public.comments(id,entity_id,parent_id,author_id,body,status,created_at,updated_at,deleted_at,legacy_author_login,legacy_url)
        values($1,$2,$3,null,$4,$5,$6,$7,$8,$9,$10) on conflict(id) do update set body=excluded.body,status=excluded.status,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at,legacy_author_login=excluded.legacy_author_login,legacy_url=excluded.legacy_url,version=public.comments.version+1 returning version`,
      [r.id,r.entity_id,r.parent_id,r.body,r.status,r.created_at,r.updated_at,r.deleted_at,r.legacy_author_login,r.legacy_url])).rows[0];
      await db.query('insert into public.comment_revisions(comment_id,version,actor_id,body,status) values($1,$2,null,$3,$4)', [r.id,row.version,r.body,r.status]);
      await db.query("insert into public.audit_events(actor_id,comment_id,version,action,reason) values(null,$1,$2,'import','Legacy Git provenance retained')", [r.id,row.version]);
      await db.query('insert into private.legacy_comment_records(source,key,comment_id,checksum,raw_record) values($1,$2,$3,$4,$5::jsonb) on conflict(source,key) do update set checksum=excluded.checksum,raw_record=excluded.raw_record', [r.source,r.key,r.id,r.checksum,JSON.stringify(r.raw_record)]); changed++;
    }
    await db.query('insert into private.import_runs(checksum,source_commit,record_count) values($1,$2,$3) on conflict do nothing', [plan.checksum,plan.sourceCommit,plan.records.length]);
    await db.query('commit'); return { entities: plan.entities.length, records: plan.records.length, changed, checksum: plan.checksum };
  } catch (error) { await db.query('rollback'); throw error; }
}
export async function reconcileComments(db, plan) {
  await db.query('begin');
  try {
    await db.query('set local role anon'); await db.query("select set_config('request.jwt.claim.sub','',true)");
    const ids = new Set(plan.records.map(r => r.id));
    const rows = (await db.query('select id,body,parent_id,entity_id from public.comments')).rows.filter(r => ids.has(r.id)).sort((a,b) => a.id.localeCompare(b.id));
    await db.query('commit');
    if (checksum(rows) !== checksum(publicImportRows(plan))) throw new Error('Shadow public projection differs from legacy snapshot');
    return { publicRecords: rows.length, matches: true };
  } catch (error) { await db.query('rollback'); throw error; }
}
