import assert from 'node:assert/strict';
import { writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { localEnvironment } from '../../scripts/backend/local-environment.mjs';
import { loadStages, runArrivals } from '../../scripts/backend/load-model.mjs';
const env = await localEnvironment(),
  profile = process.env.BACKEND_LOAD_PROFILE ?? 'ci',
  stages = loadStages(profile),
  runId = crypto.randomUUID();
const admin = createClient(
    env.fixture.url,
    env.status.SERVICE_ROLE_KEY ?? env.status.service_role_key,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ),
  api = env.fixture.url + '/functions/v1/api/v1',
  owner = env.fixture.sessions.owner;
const members = [],
  reviews = [],
  createdIds = [];
let ownerRequest,
  ownerBusy = false;
const output = 'backend-test-results/load-summary.json';
async function call(
  path,
  session,
  method = 'GET',
  body,
  idempotencyKey = crypto.randomUUID(),
) {
  const started = performance.now();
  try {
    const response = await fetch(api + path, {
      method,
      headers: {
        apikey: env.fixture.key,
        ...(session ? { authorization: 'Bearer ' + session.access_token } : {}),
        ...(body
          ? {
              'content-type': 'application/json',
              'idempotency-key': idempotencyKey,
            }
          : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    let data;
    try {
      data = await response.json();
    } catch {
      return { status: response.status, ok: false, data: null };
    }
    return {
      status: response.status,
      ok: response.ok,
      data,
      duration: performance.now() - started,
    };
  } catch {
    return { status: 0, ok: false, data: null };
  }
}
function committed(response) {
  assert.equal(
    response.status,
    200,
    'Local fixture operation failed; no token/body logged',
  );
  assert.ok(response.data?.id);
  return response.data;
}
const scope = {
  title: 'Disposable load request',
  description: 'Local measured scope only; not a production submission',
  expectedResult: 'Measured text API output',
  category: 'technology',
  priority: 'normal',
  tags: ['local'],
};
async function setup() {
  for (let i = 0; i < 24; i++) {
    const email = `bench-${runId}-${i}@example.test`,
      password = crypto.randomUUID() + 'Aa1!';
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error) throw new Error('Load identity setup failed');
    createdIds.push(created.data.user.id);
    const client = createClient(env.fixture.url, env.fixture.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signed = await client.auth.signInWithPassword({ email, password });
    if (signed.error) throw new Error('Load fixture sign-in failed');
    const session = signed.data.session;
    const post = committed(
      await call('/posts', session, 'POST', {
        title: 'Disposable measured poem',
        body: 'Baseline public poem\nSecond line',
        kind: 'poem',
        category: 'Poetry',
        tags: ['local'],
        series: '',
        order: 1,
      }),
    );
    let submitted = committed(
      await call('/posts/' + post.id + '/submit', session, 'POST', {
        expectedVersion: post.version,
      }),
    );
    const published = committed(
      await call('/posts/' + post.id + '/moderate', owner, 'POST', {
        decision: 'approve',
        revision: submitted.revision,
        expectedVersion: submitted.version,
        reason: 'Disposable load baseline',
      }),
    );
    const media = committed(
      await call('/media', session, 'POST', {
        title: 'Disposable measured media',
        description: 'Baseline media text',
        category: 'video',
        tags: ['local'],
        url: 'https://youtu.be/l5WuCFObGGQ',
      }),
    );
    submitted = committed(
      await call('/media/' + media.id + '/submit', session, 'POST', {
        expectedVersion: media.version,
      }),
    );
    const publishedMedia = committed(
      await call('/media/' + media.id + '/moderate', owner, 'POST', {
        decision: 'approve',
        revision: submitted.revision,
        expectedVersion: submitted.version,
        reason: 'Disposable load baseline',
      }),
    );
    const request = committed(await call('/requests', session, 'POST', scope));
    members.push({
      session,
      post: published,
      media: publishedMedia,
      request,
      step: 0,
      busy: false,
      waiting: new Set(),
    });
  }
  ownerRequest = committed(
    await call('/requests', members[0].session, 'POST', {
      ...scope,
      title: 'Disposable owner progress fixture',
    }),
  );
  ownerRequest = committed(
    await call('/requests/' + ownerRequest.id + '/transitions', owner, 'POST', {
      expectedVersion: ownerRequest.version,
      scopeRevision: ownerRequest.scope_revision,
      status: 'accepted',
      message: 'Accept measured fixture scope',
    }),
  );
  // Separate quota-abuse gate; its expected 429 is never counted as successful load.
  const quotaPath = '/entities/' + env.fixture.entityId + '/comments',
    quotaKey = crypto.randomUUID(),
    quotaBody = { body: 'Disposable idempotent quota boundary' };
  const first = committed(
    await call(quotaPath, members[0].session, 'POST', quotaBody, quotaKey),
  );
  await env.sql.unsafe(
    "insert into private.write_windows(actor_id,window_start,count) values($1,date_trunc('minute',statement_timestamp()),30) on conflict(actor_id,window_start) do update set count=30",
    [members[0].session.user.id],
  );
  assert.equal(
    (
      await call(quotaPath, members[0].session, 'POST', {
        body: 'Must be rate limited',
      })
    ).status,
    429,
  );
  assert.equal(
    committed(
      await call(quotaPath, members[0].session, 'POST', quotaBody, quotaKey),
    ).id,
    first.id,
  );
  report.quotaAbuse = {
    seededQuota: 30,
    expected429: 1,
    idempotentReplay: true,
  };
  // Setup is outside the timed run. The measured phases retain all quota windows intact.
  await env.sql.unsafe(
    'delete from private.feature_windows where actor_id=any($1::uuid[]) or actor_id=$2',
    [members.map((m) => m.session.user.id), owner.user.id],
  );
  await env.sql.unsafe(
    'delete from private.write_windows where actor_id=any($1::uuid[]) or actor_id=$2',
    [members.map((m) => m.session.user.id), owner.user.id],
  );
  await writeFile(
    'backend-test-results/load-sessions.json',
    JSON.stringify({ runId, sessions: members.map((m) => m.session) }),
    { mode: 0o600 },
  );
}
let authorIndex = 0;
async function author() {
  let m;
  for (let i = 0; i < members.length; i++) {
    const candidate = members[authorIndex++ % members.length];
    if (!candidate.busy) {
      m = candidate;
      break;
    }
  }
  if (!m) return read(0);
  m.busy = true;
  try {
    let feature = ['posts', 'media', 'requests', 'comments'][m.step++ % 4],
      r;
    if ((feature === 'posts' || feature === 'media') && m.waiting.has(feature))
      feature = 'comments';
    if (feature === 'posts' || feature === 'media') {
      const field = feature === 'posts' ? 'post' : 'media',
        row = m[field];
      if (row.status === 'draft') {
        r = await call(
          '/' + feature + '/' + row.id + '/submit',
          m.session,
          'POST',
          { expectedVersion: row.version },
        );
        if (r.ok) {
          m[field] = r.data;
          m.waiting.add(feature);
          reviews.push({ feature, row: r.data, m, field });
        }
      } else {
        const payload =
          feature === 'posts'
            ? {
                title: 'Disposable measured poem',
                body: 'Measured revision ' + m.step + '\nSecond line',
                kind: 'poem',
                category: 'Poetry',
                tags: ['local'],
                series: '',
                order: 1,
              }
            : {
                title: 'Disposable measured media',
                description: 'Measured description ' + m.step,
                category: 'video',
                tags: ['local'],
                url: 'https://youtu.be/l5WuCFObGGQ',
              };
        r = await call('/' + feature + '/' + row.id, m.session, 'PATCH', {
          expectedVersion: row.version,
          payload,
        });
        if (r.ok) m[field] = r.data;
      }
    } else if (feature === 'requests') {
      r = await call(
        '/requests/' + m.request.id + '/scope',
        m.session,
        'PATCH',
        {
          expectedVersion: m.request.version,
          scopeRevision: m.request.scope_revision,
          payload: {
            ...scope,
            description: 'Measured changed local scope ' + m.step,
          },
        },
      );
      if (r.ok) m.request = r.data;
    } else {
      r = await call(
        '/entities/' + env.fixture.entityId + '/comments',
        m.session,
        'POST',
        { body: 'Disposable measured comment ' + runId },
      );
      if (r.ok) reviews.push({ feature: 'comments', row: r.data });
    }
    return { ...r, kind: 'write:' + feature };
  } finally {
    m.busy = false;
  }
}
async function ownerWrite() {
  const work = reviews.shift();
  if (work) {
    let r;
    if (work.feature === 'comments')
      r = await call('/comments/' + work.row.id + '/moderate', owner, 'POST', {
        status: 'approved',
        expectedVersion: work.row.version,
        reason: 'Disposable load review',
      });
    else {
      r = await call(
        '/' + work.feature + '/' + work.row.id + '/moderate',
        owner,
        'POST',
        {
          decision: 'approve',
          revision: work.row.revision,
          expectedVersion: work.row.version,
          reason: 'Disposable load review',
        },
      );
      if (r.ok) {
        work.m[work.field] = r.data;
        work.m.waiting.delete(work.feature);
      }
    }
    return { ...r, kind: 'write:owner-' + work.feature };
  }
  if (ownerBusy) return read(0);
  ownerBusy = true;
  try {
    const r = await call(
      '/requests/' + ownerRequest.id + '/transitions',
      owner,
      'POST',
      {
        expectedVersion: ownerRequest.version,
        scopeRevision: ownerRequest.scope_revision,
        status: 'accepted',
        message: 'Measured progress without scope change',
      },
    );
    if (r.ok) ownerRequest = r.data;
    return { ...r, kind: 'write:owner-requests' };
  } finally {
    ownerBusy = false;
  }
}
async function read(slot) {
  const m = members[slot % members.length],
    index = slot % 8;
  const paths = [
    '/entities/' + env.fixture.entityId + '/comments',
    '/entities/' + env.fixture.entityId + '/comments?view=mine',
    '/posts',
    '/posts?view=mine',
    '/media',
    '/media?view=mine',
    '/requests',
    '/requests?view=mine',
  ];
  const auth = index % 2 === 1;
  const r = await call(paths[index], auth ? m.session : null);
  return {
    ...r,
    ok: r.ok && Array.isArray(r.data?.items),
    kind: auth ? 'authenticated-read' : 'public-read',
  };
}
async function reconcile() {
  const ids = members.map((m) => m.session.user.id);
  const publicRows = await env.sql.unsafe(
    'select p.id,p.published_revision,r.body,r.moderation from private.publications p join private.publication_revisions r on r.publication_id=p.id and r.revision=p.published_revision where p.author_id=any($1::uuid[])',
    [ids],
  );
  assert.ok(publicRows.length === 48);
  assert.ok(publicRows.every((r) => r.moderation === 'approved'));
  for (const row of publicRows) {
    const feature = members.some((m) => m.post.id === row.id)
      ? 'posts'
      : 'media';
    const visible = await call('/' + feature + '/' + row.id);
    assert.equal(visible.status, 200);
    assert.equal(visible.data.revision, row.published_revision);
    assert.equal(
      feature === 'posts'
        ? visible.data.payload.body
        : visible.data.payload.description,
      row.body,
    );
  }
  const requests = await env.sql.unsafe(
    'select status,result,scope_revision,accepted_scope_revision from private.help_requests where author_id=any($1::uuid[])',
    [ids],
  );
  assert.ok(
    requests.every((r) =>
      r.status === 'accepted'
        ? r.accepted_scope_revision === r.scope_revision
        : r.status === 'new' &&
          r.result === '' &&
          r.accepted_scope_revision === null,
    ),
  );
  const history = await env.sql.unsafe(
    'select count(*)::int n from private.request_events e join private.help_requests r on r.id=e.request_id where r.author_id=any($1::uuid[])',
    [ids],
  );
  return {
    publishedRows: publicRows.length,
    requests: requests.length,
    requestEvents: history[0].n,
    pendingSeparated: true,
  };
}
async function cleanup() {
  if (!createdIds.length) return;
  const ids = createdIds;
  await env.sql.begin(async (tx) => {
    await tx.unsafe('set constraints all deferred');
    const entities = (
      await tx.unsafe(
        'select entity_id id from private.publications where author_id=any($1::uuid[]) union select entity_id id from private.help_requests where author_id=any($1::uuid[])',
        [ids],
      )
    ).map((r) => r.id);
    const pubs = (
        await tx.unsafe(
          'select id from private.publications where author_id=any($1::uuid[])',
          [ids],
        )
      ).map((r) => r.id),
      requests = (
        await tx.unsafe(
          'select id from private.help_requests where author_id=any($1::uuid[])',
          [ids],
        )
      ).map((r) => r.id),
      comments = (
        await tx.unsafe(
          'select id from public.comments where author_id=any($1::uuid[])',
          [ids],
        )
      ).map((r) => r.id);
    for (const table of ['audit_events', 'comment_revisions'])
      await tx.unsafe(
        `delete from public.${table} where comment_id=any($1::uuid[])`,
        [comments],
      );
    await tx.unsafe('delete from public.comments where id=any($1::uuid[])', [
      comments,
    ]);
    for (const table of [
      'publication_events',
      'revision_tags',
      'series_slots',
      'publication_revisions',
    ])
      await tx.unsafe(
        `delete from private.${table} where publication_id=any($1::uuid[])`,
        [pubs],
      );
    await tx.unsafe(
      'delete from private.publications where id=any($1::uuid[])',
      [pubs],
    );
    for (const table of ['request_events', 'request_scope_revisions'])
      await tx.unsafe(
        `delete from private.${table} where request_id=any($1::uuid[])`,
        [requests],
      );
    await tx.unsafe(
      'delete from private.help_requests where id=any($1::uuid[])',
      [requests],
    );
    await tx.unsafe(
      'delete from public.content_entities where id=any($1::uuid[])',
      [entities],
    );
    await tx.unsafe(
      'delete from private.feature_receipts where actor_id=any($1::uuid[]) or object_id=any($2::uuid[])',
      [ids, [...pubs, ...requests]],
    );
    for (const table of ['feature_windows', 'write_windows', 'mutation_keys'])
      await tx.unsafe(
        `delete from private.${table} where actor_id=any($1::uuid[])`,
        [ids],
      );
    await tx.unsafe('delete from public.profiles where id=any($1::uuid[])', [
      ids,
    ]);
    // Disposable owner is shared with the browser fixture; remove only test rate counters after the timed run.
    await tx.unsafe('delete from private.feature_windows where actor_id=$1', [
      owner.user.id,
    ]);
    await tx.unsafe('delete from private.write_windows where actor_id=$1', [
      owner.user.id,
    ]);
  });
  for (const id of createdIds) {
    const r = await admin.auth.admin.deleteUser(id);
    if (r.error) throw new Error('Disposable load identity cleanup failed');
  }
  await rm('backend-test-results/load-sessions.json', { force: true });
  assert.equal(
    (
      await env.sql.unsafe(
        'select id from public.profiles where id=any($1::uuid[])',
        [ids],
      )
    ).length,
    0,
  );
}
let report = {
  profile,
  runId,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  environment: {
    node: process.version,
    platform: process.platform,
    cpu: os.cpus()[0]?.model,
    cpuCount: os.availableParallelism(),
    memoryBytes: os.totalmem(),
    dbVersion: (await env.sql`select version() v`)[0].v,
    location:
      'GitHub runner/local loopback; not representative Vietnam network',
  },
  stages: [],
  passed: false,
};
try {
  await setup();
  let global = 0;
  for (const stage of stages) {
    const result = await runArrivals(stage, () => {
      const slot = global++;
      return slot % 10 === 8
        ? author()
        : slot % 10 === 9
          ? ownerWrite()
          : read(slot);
    });
    report.stages.push(result);
    console.log(JSON.stringify({ loadStage: result }));
  }
  report.reconciliation = await reconcile();
  report.passed = report.stages.every((s) => s.passed);
} finally {
  try {
    await cleanup();
    report.cleanup = true;
  } catch {
    report.cleanup = false;
    report.passed = false;
  }
  await writeFile(output, JSON.stringify(report, null, 2));
  await env.sql.end();
}
console.log(
  JSON.stringify({
    loadResult: {
      profile,
      passed: report.passed,
      cleanup: report.cleanup,
      stages: report.stages.map((s) => ({
        name: s.name,
        rate: s.rate,
        p95: s.latency.p95,
        failures: s.failures,
        dropped: s.dropped,
        writeFraction: s.writeFraction,
      })),
    },
  }),
);
if (!report.passed) process.exitCode = 1;
