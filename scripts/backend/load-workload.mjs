import { cleanupLoadRows } from './load-cleanup.mjs';
import { postgresAdapter } from './postgres-adapter.mjs';
import assert from 'node:assert/strict';
import { writeFile, rm, readFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { loadStages, runArrivals } from './load-model.mjs';
import { edgeLogSummary } from './load-diagnostics.mjs';
export async function runLoadWorkload(env, { profile = 'ci', output = 'backend-test-results/load-summary.json', hosted = false, closeDatabase = true } = {}) {
const stages = loadStages(profile), runId = crypto.randomUUID();
const admin = createClient(
    env.fixture.url,
    env.status.SERVICE_ROLE_KEY ?? env.status.service_role_key,
    { ...(env.authFetch ? { global: { fetch: env.authFetch } } : {}), auth: { persistSession: false, autoRefreshToken: false } },
  ),
  api = env.fixture.url + '/functions/v1/api/v1',
  owner = env.fixture.sessions.owner;
const members = [],
  reviews = [],
  createdIds = [];
let ownerRequest,
  ownerBusy = false;
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
      ok:
        response.ok &&
        (method === 'GET' ||
          (typeof data?.id === 'string' &&
            Number.isInteger(data?.version) &&
            data.version > 0)),
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
const textPayload = 'Đo tải văn bản local. '.repeat(45).trim();
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
      ...(env.authFetch ? { global: { fetch: env.authFetch } } : {}),
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signed = await client.auth.signInWithPassword({ email, password });
    if (signed.error) throw new Error('Load fixture sign-in failed');
    const session = signed.data.session;
    const post = committed(
      await call('/posts', session, 'POST', {
        title: 'Disposable measured poem',
        body: 'Baseline public poem\n' + textPayload,
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
        description: textPayload.slice(0, 500),
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
                body: 'Measured revision ' + m.step + '\n' + textPayload,
                kind: 'poem',
                category: 'Poetry',
                tags: ['local'],
                series: '',
                order: 1,
              }
            : {
                title: 'Disposable measured media',
                description:
                  'Measured description ' +
                  m.step +
                  ' ' +
                  textPayload.slice(0, 500),
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
            description:
              'Measured changed local scope ' + m.step + ' ' + textPayload,
          },
        },
      );
      if (r.ok) m.request = r.data;
    } else {
      r = await call(
        '/entities/' + env.fixture.entityId + '/comments',
        m.session,
        'POST',
        {
          body:
            'Disposable measured comment ' +
            runId +
            ' ' +
            textPayload.slice(0, 250),
        },
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
  const nextStatus =
    ownerRequest.status === 'accepted' ||
    ownerRequest.status === 'completed' ||
    ownerRequest.status === 'waiting'
      ? 'in-progress'
      : ownerRequest.version % 4 === 0
        ? 'waiting'
        : 'completed';
  try {
    const r = await call(
      '/requests/' + ownerRequest.id + '/transitions',
      owner,
      'POST',
      {
        expectedVersion: ownerRequest.version,
        scopeRevision: ownerRequest.scope_revision,
        status: nextStatus,
        message: 'Measured progress without scope change',
        result: nextStatus === 'completed' ? textPayload.slice(0, 500) : '',
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
    ok:
      r.ok &&
      Array.isArray(r.data?.items) &&
      r.data.items.every((row) =>
        auth
          ? row.author_id === m.session.user.id
          : index === 6
            ? row.moderation === 'approved'
            : row.status === 'approved',
      ),
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
      ['accepted', 'in-progress', 'waiting', 'completed'].includes(r.status)
        ? r.accepted_scope_revision === r.scope_revision &&
          (r.status === 'completed'
            ? r.result.trim().length > 0
            : r.result === '')
        : r.status === 'new' &&
          r.result === '' &&
          r.accepted_scope_revision === null,
    ),
  );
  const history = await env.sql.unsafe(
    'select count(*)::int n from private.request_events e join private.help_requests r on r.id=e.request_id where r.author_id=any($1::uuid[])',
    [ids],
  );
  const pending = await fetch(
    env.fixture.url +
      '/rest/v1/comments?select=id&author_id=in.(' +
      ids.join(',') +
      ')&status=neq.approved',
    {
      headers: { apikey: env.fixture.key },
      signal: AbortSignal.timeout(10000),
    },
  );
  assert.equal(pending.status, 200);
  assert.deepEqual(await pending.json(), []);
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
  report.deletedRows = await cleanupLoadRows(
    postgresAdapter(env.sql),
    ids,
    owner.user.id,
  );
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
      hosted ? 'Owner-supplied hosted generator; location unverified until recorded' : 'GitHub runner/local loopback; not representative Vietnam network',
  },
  workload: {
    readsTarget: 0.8,
    writesTarget: 0.2,
    identities: 24,
    postChars: textPayload.length,
    mediaChars: 500,
    scopeChars: textPayload.length,
    commentChars: 250,
    maxInflight: 150,
  },
  stages: [],
  passed: false,
};
try {
  await setup();
  report.databaseBytesBefore = (
    await env.sql`select pg_database_size(current_database())::text n`
  )[0].n;
  report.observedDatabase = {
    hostMetricsScope: hosted ? 'generator only; not Supabase database host' : 'disposable local host',
    samplingSeconds: 5,
    samples: 0,
    maxConnections: 0,
    maxActive: 0,
    maxWaitingLocks: 0,
    maxProbeMs: 0,
    maxHostLoad1: 0,
    minHostFreeBytes: os.freemem(),
    slowSamples: [],
    errors: 0,
  };
  let samplerWork = Promise.resolve();
  const diagnosticSince = new Date().toISOString();
  const diagnosticStart = performance.now();
  const sampler = setInterval(() => {
    samplerWork = (async () => {
      try {
        const probeStarted = performance.now();
        const r = (
          await env.sql`select count(*)::int connections,count(*) filter(where state='active')::int active,count(*) filter(where wait_event_type='Lock')::int locks from pg_stat_activity where datname=current_database()`
        )[0];
        const stats = report.observedDatabase;
        stats.samples++;
        stats.maxConnections = Math.max(stats.maxConnections, r.connections);
        stats.maxActive = Math.max(stats.maxActive, r.active);
        stats.maxWaitingLocks = Math.max(stats.maxWaitingLocks, r.locks);
        const probeMs = Math.round(performance.now() - probeStarted);
        stats.maxProbeMs = Math.max(stats.maxProbeMs, probeMs);
        stats.maxHostLoad1 = Math.max(stats.maxHostLoad1, os.loadavg()[0]);
        stats.minHostFreeBytes = Math.min(stats.minHostFreeBytes, os.freemem());
        if (probeMs >= 100 && stats.slowSamples.length < 20) stats.slowSamples.push({ offsetMs: Math.round(performance.now() - diagnosticStart), probeMs, connections: r.connections, active: r.active, waitingLocks: r.locks });
      } catch {
        report.observedDatabase.errors++;
      }
    })();
  }, 5000);
  let global = 0;
  try {
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
      if (hosted && !result.passed) break;
    }
  } finally {
    clearInterval(sampler);
    await samplerWork;
    // Docker/platform logs can contain private data. Retain only validated numeric labels.
    try {
      if (hosted) throw Error('HOSTED_LOGS_USE_PROVIDER_AGGREGATE');
      const project = (await readFile('supabase/config.toml', 'utf8')).match(/^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m)?.[1];
      if (!project) throw Error('Missing local project');
      const logs = spawnSync('docker', ['logs', '--since', diagnosticSince, 'supabase_edge_runtime_' + project], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] });
      report.edgeDiagnostics = logs.status === 0 ? edgeLogSummary(logs.stdout + '\n' + logs.stderr) : { available: false, reason: 'LOCAL_LOGS_UNAVAILABLE' };
    } catch { report.edgeDiagnostics = { available: false, reason: hosted ? 'HOSTED_LOGS_REQUIRE_PROVIDER_AGGREGATE' : 'LOCAL_LOGS_UNAVAILABLE' }; }
  }
  report.databaseBytesAfter = (
    await env.sql`select pg_database_size(current_database())::text n`
  )[0].n;
  report.reconciliation = await reconcile();
  report.passed =
    report.stages.length === stages.length && report.stages.every((s) => s.passed) &&
    report.observedDatabase.errors === 0;
} finally {
  try {
    await cleanup();
    report.cleanup = true;
  } catch (error) {
    report.cleanupErrorCode = error?.code ?? 'CLEANUP_FAILED';
    report.cleanup = false;
    report.passed = false;
  }
  await writeFile(output, JSON.stringify(report, null, 2));
  if (closeDatabase) await env.sql.end();
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
return report;
}
