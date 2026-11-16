import { expect, it } from 'vitest';
import { inventory } from '../../scripts/backend/legacy-run-inventory.mjs';

const sha = 'a'.repeat(40);
const run = (id: number, status: string, workflow_id = 42) => ({ id, status, workflow_id });
function fixture(change: (path: string, value: any) => any = (_p, v) => v) {
  const calls: { url: string; options: RequestInit }[] = [];
  let branches = 0;
  const fetcher = async (input: string, options: RequestInit) => {
    const url = new URL(input), path = url.pathname.replace('/repos/sugia279/hiens-nha', '') + url.search;
    calls.push({ url: input, options });
    let value: any;
    if (path === '/branches/main') value = { commit: { sha }, sample: ++branches };
    else if (path.startsWith('/actions/workflows?')) value = { total_count: 1, workflows: [{ id: 42, name: 'Archive guestbook', path: '.github/workflows/archive-guestbook.yml', state: 'active' }] };
    else if (path.includes('status=')) value = { total_count: path.includes('status=in_progress&') ? 1 : 0, workflow_runs: path.includes('status=in_progress&') ? [run(80, 'in_progress', 99)] : [] };
    else value = { total_count: 2, workflow_runs: [run(80, 'in_progress', 99), run(70, 'completed')] };
    return new Response(JSON.stringify(change(path, value)), { status: 200 });
  };
  return { calls, fetcher };
}
it('distinguishes coherent no-active observation from a verified freeze/drain, without credentials or writes', async () => {
  const f = fixture(); const report = await inventory({ fetcher: f.fetcher, pause: async () => {} });
  expect(report.coherent).toBe(true); expect(report.noActiveArchivesObserved).toBe(true);
  expect(report.freezePerformed).toBe(false); expect(report.drainVerified).toBe(false);
  expect(report.reasons).toContain('LEGACY_INPUT_NOT_FROZEN_DRAIN_NOT_VERIFIED');
  expect(f.calls).toHaveLength(9);
  for (const { url, options } of f.calls) {
    expect(new URL(url).origin).toBe('https://api.github.com');
    expect(new URL(url).pathname).toMatch(/^\/repos\/sugia279\/hiens-nha\//);
    expect(options.method).toBe('GET'); expect(options.body).toBeUndefined(); expect(options.redirect).toBe('error');
    expect(Object.keys(options.headers!).some(k => /authorization|apikey/i.test(k))).toBe(false);
  }
});
it('fails closed on the previous total_count=1 / empty-list symptom and truncated/malformed/duplicate status inventories', async () => {
  for (const mutate of [
    () => ({ total_count: 1, workflow_runs: [] }),
    () => ({ total_count: 101, workflow_runs: [run(1, 'in_progress')] }),
    () => ({ total_count: 1, workflow_runs: [run(1, 'completed')] }),
    () => ({ total_count: 2, workflow_runs: [run(1, 'in_progress'), run(1, 'in_progress')] }),
    () => ({ total_count: 1, workflow_runs: [{ id: 1, status: 'in_progress' }] }),
  ]) {
    const f = fixture((p, v) => p.includes('status=in_progress&') ? mutate() : v);
    const report = await inventory({ fetcher: f.fetcher, pause: async () => {} });
    expect(report.coherent).toBe(false); expect(report.noActiveArchivesObserved).toBe(false); expect(report.drainVerified).toBe(false);
    expect(f.calls.length).toBeLessThan(10);
  }
});
it('reports active or waiting archive jobs and refuses main movement or changes between listings', async () => {
  for (const kind of ['active', 'waiting', 'main', 'transition', 'missed']) {
    const f = fixture((p, v) => {
      if (kind === 'main' && p === '/branches/main' && v.sample === 2) return { commit: { sha: 'b'.repeat(40) } };
      if (kind === 'active' && p.includes('status=in_progress&')) return { total_count: 1, workflow_runs: [run(80, 'in_progress')] };
      if (kind === 'active' && p === '/actions/runs?per_page=100') return { total_count: 2, workflow_runs: [run(80, 'in_progress'), run(70, 'completed')] };
      if (kind === 'waiting' && p.includes('status=waiting&')) return { total_count: 1, workflow_runs: [run(81, 'waiting')] };
      if (kind === 'transition' && p.includes('status=in_progress&')) return { total_count: 1, workflow_runs: [run(70, 'in_progress')] };
      if (kind === 'missed' && p === '/actions/runs?per_page=100') return { total_count: 1, workflow_runs: [run(71, 'queued')] };
      return v;
    });
    const report = await inventory({ fetcher: f.fetcher, pause: async () => {} });
    expect(report.noActiveArchivesObserved).toBe(false); expect(report.drainVerified).toBe(false);
    expect(report.coherent).toBe(['active', 'waiting'].includes(kind));
  }
});
it('stops without retries or raw error/body disclosure on HTTP, network and body-bound failures', async () => {
  for (const kind of ['http', 'network', 'oversize']) {
    let calls = 0;
    const report = await inventory({ pause: async () => {}, fetcher: async () => {
      calls++; if (kind === 'network') throw Error('private operator fixture');
      return new Response(kind === 'oversize' ? 'x'.repeat(4 * 1024 * 1024 + 1) : 'private operator fixture', { status: kind === 'http' ? 403 : 200 });
    } });
    expect(calls).toBe(1); expect(report.coherent).toBe(false); expect(JSON.stringify(report)).not.toContain('private operator fixture');
  }
});
