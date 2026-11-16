import { pathToFileURL } from 'node:url';

const base = 'https://api.github.com/repos/sugia279/hiens-nha';
const statuses = ['queued', 'in_progress', 'waiting', 'pending', 'requested'];
const shaPattern = /^[a-f0-9]{40}$/;
const validRun = r => Number.isSafeInteger(r?.id) && r.id > 0 &&
  Number.isSafeInteger(r.workflow_id) && r.workflow_id > 0 &&
  [...statuses, 'completed'].includes(r.status);

/** Fixed public GET inventory only. Never freezes, cancels, dispatches or declares a drain. */
export async function inventory({ fetcher = fetch, pause = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const report = {
    version: 1, createdAt: new Date().toISOString(),
    repository: 'sugia279/hiens-nha', scope: 'read-only pre-freeze archive observation',
    requests: 0, coherent: false, noActiveArchivesObserved: false,
    freezePerformed: false, drainVerified: false, reasons: [], activeArchiveRuns: [],
  };
  const get = async path => {
    report.requests++;
    const response = await fetcher(base + path, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/vnd.github+json', 'Cache-Control': 'no-cache', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!response.ok) throw Error();
    const reader = response.body?.getReader();
    let size = 0, text = ''; const decoder = new TextDecoder();
    if (reader) for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 4 * 1024 * 1024) { await reader.cancel(); throw Error(); }
      text += decoder.decode(value, { stream: true });
    }
    const value = JSON.parse(text + decoder.decode());
    await pause(250);
    return value;
  };
  try {
    const before = await get('/branches/main');
    if (!shaPattern.test(before?.commit?.sha)) throw Error();
    report.mainBefore = before.commit.sha;
    const workflows = await get('/actions/workflows?per_page=100');
    if (!Array.isArray(workflows?.workflows) || workflows.total_count !== workflows.workflows.length) throw Error();
    const archives = workflows.workflows.filter(w => w.name === 'Archive guestbook' && w.path === '.github/workflows/archive-guestbook.yml');
    if (archives.length !== 1 || !Number.isSafeInteger(archives[0].id) || archives[0].id <= 0 || !['active', 'disabled_manually', 'disabled_inactivity'].includes(archives[0].state)) throw Error();
    report.workflowId = archives[0].id;
    report.workflowState = archives[0].state;
    const observed = new Map();
    report.statusCounts = {};
    for (const status of statuses) {
      const page = await get(`/actions/runs?status=${status}&per_page=100`);
      if (!Array.isArray(page?.workflow_runs) || !Number.isSafeInteger(page.total_count) || page.total_count < 0 || page.total_count !== page.workflow_runs.length || !page.workflow_runs.every(r => validRun(r) && r.status === status)) throw Error();
      report.statusCounts[status] = page.total_count;
      for (const run of page.workflow_runs) {
        if (observed.has(run.id)) throw Error();
        observed.set(run.id, run);
      }
    }
    const recent = await get('/actions/runs?per_page=100');
    if (!Array.isArray(recent?.workflow_runs) || !Number.isSafeInteger(recent.total_count) || recent.total_count < recent.workflow_runs.length || recent.workflow_runs.length !== Math.min(recent.total_count, 100) || !recent.workflow_runs.every(validRun) || new Set(recent.workflow_runs.map(r => r.id)).size !== recent.workflow_runs.length) throw Error();
    for (const run of recent.workflow_runs) {
      // A transition during the sample is not silently interpreted as drained.
      if (run.workflow_id === report.workflowId && run.status !== 'completed' && !observed.has(run.id)) throw Error();
      if (observed.has(run.id) && (observed.get(run.id).status !== run.status || observed.get(run.id).workflow_id !== run.workflow_id)) throw Error();
    }
    report.activeArchiveRuns = [...observed.values()].filter(r => r.workflow_id === report.workflowId)
      .map(r => ({ id: r.id, status: r.status })).sort((a, b) => a.id - b.id);
    const after = await get('/branches/main');
    if (!shaPattern.test(after?.commit?.sha)) throw Error();
    report.mainAfter = after.commit.sha;
    if (report.mainBefore !== report.mainAfter) { report.reasons.push('MAIN_CHANGED_DURING_OBSERVATION'); return report; }
    report.coherent = true;
    report.noActiveArchivesObserved = report.activeArchiveRuns.length === 0;
    if (!report.noActiveArchivesObserved) report.reasons.push('ACTIVE_ARCHIVE_RUNS');
    report.reasons.push('LEGACY_INPUT_NOT_FROZEN_DRAIN_NOT_VERIFIED');
  } catch {
    // Never echo upstream errors, response bodies, titles, URLs, tokens or headers.
    report.reasons.push('INVENTORY_UNVERIFIED_HTTP_SCHEMA_COUNT_OR_STATE');
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.slice(2).join(' ') !== '--confirm-read-only') {
    console.error('Explicit --confirm-read-only required; no other inputs accepted.'); process.exitCode = 1;
  } else {
    const report = await inventory(); console.log(JSON.stringify(report, null, 2));
    if (!report.coherent || !report.noActiveArchivesObserved) process.exitCode = 1;
  }
}
