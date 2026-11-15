import { checksum, applyCommentsPlan, reconcileComments, publicImportRows } from './comments-model.mjs';
import { applyPublicationsPlan, reconcilePublications } from './publications-model.mjs';
import { applyRequestsPlan, reconcileRequests } from './requests-model.mjs';
import { createHash } from 'node:crypto';
const sha256 = text => createHash('sha256').update(text).digest('hex');

// Insert order follows nondeferrable FKs; revision pointer cycles are initially deferred.
export const importTables = [
  'public.content_entities', 'private.categories', 'private.tags', 'private.series',
  'private.publications', 'private.publication_revisions', 'private.revision_tags', 'private.series_slots',
  'public.comments', 'public.comment_revisions', 'public.audit_events', 'private.legacy_comment_records',
  'private.publication_events', 'private.help_requests', 'private.request_scope_revisions', 'private.request_events',
  'private.legacy_tombstones', 'private.feature_imports', 'public.legacy_mappings', 'private.import_runs',
];
const volatile = {
  'public.content_entities': ['created_at'],
  'public.comment_revisions': ['created_at'],
  'public.audit_events': ['id', 'created_at'],
  'private.publication_events': ['id'],
  'private.import_runs': ['imported_at'],
};
const ident = name => { if (!/^[a-z_][a-z_0-9]*$/.test(name)) throw new Error('Invalid internal identifier'); return `"${name}"`; };
const tableName = name => name.split('.').map(ident).join('.');
export const sqlString = value => "E'" + String(value).replaceAll('\\', '\\\\').replaceAll("'", "''") + "'";
const json = value => sqlString(JSON.stringify(value)) + '::jsonb';
export function sqlBlock(body) {
  let tag = '$hn_import$'; while (body.includes(tag)) tag = tag.slice(0, -1) + '_$';
  return `do ${tag}\nbegin\n${body}\nend\n${tag};`;
}
const assert = (expression, label) => `if not coalesce((${expression}),false) then raise exception ${sqlString(label)}; end if;`;
function projection(table, from, filter = '') {
  const ignored = (volatile[table] ?? []).map(sqlString).join(',');
  const row = `to_jsonb(t)-array[${ignored}]::text[]`;
  return `(select coalesce(jsonb_agg(${row} order by (${row})::text),'[]'::jsonb) from ${from} t ${filter})`;
}
function actual(table, runKey) {
  return projection(table, tableName(table), table === 'private.import_runs' ? `where checksum<>${sqlString(runKey)}` : '');
}
const expected = (table, rows) => projection(table, `jsonb_populate_recordset(null::${tableName(table)},${json(rows)})`);
export async function captureImportState(db) {
  const state = {};
  for (const table of importTables) state[table] = (await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) data from ${tableName(table)} t`)).rows[0].data;
  return state;
}
export async function applySnapshot(db, snapshot) {
  const results = [await applyCommentsPlan(db, snapshot.comments)];
  for (const plan of snapshot.publications) results.push(await applyPublicationsPlan(db, plan));
  results.push(await applyRequestsPlan(db, snapshot.requests));
  return results;
}
export async function reconcileSnapshot(db, snapshot) {
  const results = [await reconcileComments(db, snapshot.comments)];
  for (const plan of snapshot.publications) results.push(await reconcilePublications(db, plan));
  results.push(await reconcileRequests(db, snapshot.requests));
  return results;
}
function shadowBody(snapshot) {
  const publicComments = publicImportRows(snapshot.comments);
  const query = `(select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]'::jsonb) from (select id,body,parent_id,entity_id from public.comments) c)`;
  const comments = [...publicComments].sort((a, b) => a.id.localeCompare(b.id));
  const lines = ["perform set_config('request.jwt.claim.sub','',true);", "perform set_config('request.jwt.claims','{}',true);", 'set local role anon;', assert(`${query}=${json(comments)}`, 'Comments public projection differs')];
  for (const plan of snapshot.publications) for (const r of plan.records) {
    const call = `public.publication_read(p_feature=>${sqlString(plan.feature)},p_id=>${sqlString(r.id)}::uuid)`;
    if (r.raw.approved && !r.raw.deleted) {
      const payload = plan.feature === 'media' ? `(${call}->'payload')-'seriesId'-'sourceUrl'` : `(${call}->'payload')-'seriesId'`;
      lines.push(assert(`(${payload})=${json(r.payload)} and (${call}->'author_id')='null'::jsonb`, 'Publication public projection/ownership differs'));
      if (plan.feature === 'media') lines.push(assert(`${call}->'payload'->>'sourceUrl'=${sqlString(r.sourceUrl)}`, 'Media source URL differs'));
    } else {
      lines.push(`begin perform ${call}; raise exception 'Private publication leaked'; exception when sqlstate 'PT404' then null; end;`);
    }
  }
  for (const r of snapshot.requests.records) {
    const call = `public.request_read(p_id=>${sqlString(r.id)}::uuid)`;
    if (r.raw.approved && !r.raw.deleted) lines.push(assert(`(${call}->'payload')=${json(r.payload)} and ${call}->>'status'=${sqlString(r.raw.status)} and ${call}->>'result'=${sqlString(r.raw.result)}`, 'Request public projection differs'));
    else lines.push(`begin perform ${call}; raise exception 'Private request leaked'; exception when sqlstate 'PT404' then null; end;`);
  }
  return lines.join('\n');
}
export const shadowAssertionSql = snapshot => sqlBlock(shadowBody(snapshot));
export async function prepareHostedPacket(db, snapshot, projectRef) {
  if (!/^[a-z0-9]{20}$/.test(projectRef) || !/^[a-f0-9]{40}$/.test(snapshot.sourceCommit)) throw new Error('Exact target/source required');
  const baseline = await captureImportState(db);
  const applied = await applySnapshot(db, snapshot), shadow = await reconcileSnapshot(db, snapshot);
  const after = await captureImportState(db);
  for (const rows of Object.values(after)) for (const row of rows) for (const key of ['actor_id', 'author_id']) if (row[key] != null) throw new Error('Legacy Auth ownership must remain unclaimed');
  const migrationRows = (await db.query('select version,name from supabase_migrations.schema_migrations order by version')).rows;
  const plans = [snapshot.comments, ...snapshot.publications, snapshot.requests];
  const planChecksums = plans.map(p => p.checksum), runKey = checksum({ version: 1, projectRef, sourceCommit: snapshot.sourceCommit, planChecksums });
  const recordCount = plans.reduce((n, p) => n + p.records.length, 0);
  const guards = [
    "perform pg_advisory_xact_lock(hashtextextended('hiens-hosted-shadow-import',0));",
    'perform 1 from private.backend_settings where singleton for update;',
    'perform 1 from private.feature_controls order by feature for update;',
    assert("(select comments_source='git' and comments_epoch=0 and not comments_writes_enabled from private.backend_settings where singleton)", 'Comment source must remain frozen Git0'),
    assert("(select count(*)=3 and bool_and(source='git' and epoch=0 and not writes_enabled) from private.feature_controls)", 'Feature sources must remain frozen Git0'),
    assert(`(select coalesce(jsonb_agg(jsonb_build_object('version',version,'name',name) order by version),'[]'::jsonb) from supabase_migrations.schema_migrations)=${json(migrationRows)}`, 'Migration history differs'),
  ];
  for (const table of importTables) {
    const [schema, name] = table.split('.');
    const cols = (await db.query('select column_name,udt_name,is_nullable,ordinal_position from information_schema.columns where table_schema=$1 and table_name=$2 order by ordinal_position', [schema, name])).rows;
    if (!cols.length) throw new Error('Missing import table');
    guards.push(assert(`(select jsonb_agg(jsonb_build_object('column_name',column_name,'udt_name',udt_name,'is_nullable',is_nullable,'ordinal_position',ordinal_position) order by ordinal_position) from information_schema.columns where table_schema=${sqlString(schema)} and table_name=${sqlString(name)})=${json(cols)}`, `Schema differs: ${table}`));
    guards.push(assert(`(select relrowsecurity from pg_class where oid=${sqlString(table)}::regclass)`, `RLS missing: ${table}`));
  }
  // Prevent a concurrent operator from changing the checked footprint during this transaction.
  guards.push(`lock table ${importTables.map(tableName).join(',')} in share row exclusive mode;`);
  const equalState = state => importTables.map(t => assert(`${actual(t, runKey)}=${expected(t, state[t])}`, `Import state drift: ${t}`)).join('\n');
  const inserts = [];
  for (const table of importTables) {
    const before = new Set(baseline[table].map(r => checksum(r)));
    const rows = after[table].filter(r => !before.has(checksum(r)));
    if (baseline[table].some(r => !after[table].some(a => checksum(a) === checksum(r)))) throw new Error('Initial packet cannot update/delete baseline rows');
    if (rows.length > 10000) throw new Error('Import table exceeds reviewed packet bound');
    if (rows.length) inserts.push(`insert into ${tableName(table)} select * from jsonb_populate_recordset(null::${tableName(table)},${json(rows)});`);
  }
  const body = `${guards.join('\n')}\nif exists(select 1 from private.import_runs where checksum=${sqlString(runKey)}) then\n${equalState(after)}\n${assert(`exists(select 1 from private.import_runs where checksum=${sqlString(runKey)} and source_commit=${sqlString(snapshot.sourceCommit)} and record_count=${recordCount})`, 'Transport receipt differs')}\nelse\n${equalState(baseline)}\n${inserts.join('\n')}\n${equalState(after)}\ninsert into private.import_runs(checksum,source_commit,record_count) values(${sqlString(runKey)},${sqlString(snapshot.sourceCommit)},${recordCount});\nend if;\n${shadowBody(snapshot)}`;
  const applySql = sqlBlock(body), shadowSql = shadowAssertionSql(snapshot);
  const checkSql = sqlBlock(`${guards.join('\n')}\nif exists(select 1 from private.import_runs where checksum=${sqlString(runKey)}) then\n${equalState(after)}\nelse\n${equalState(baseline)}\nend if;`);
  if (Buffer.byteLength(applySql) > 5_000_000) throw new Error('Packet exceeds reviewed size bound');
  return { version: 1, projectRef, sourceCommit: snapshot.sourceCommit, runKey, recordCount, planChecksums,
    applySql, shadowSql, checkSql, applySha256: sha256(applySql), shadowSha256: sha256(shadowSql), checkSha256: sha256(checkSql),
    summary: { applied, shadow, tables: importTables.map(table => ({ table, baseline: baseline[table].length, after: after[table].length })) } };
}
