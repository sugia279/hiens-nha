import { it, expect } from 'vitest';
import { edgeLogSummary } from '../../scripts/backend/load-diagnostics.mjs';

it('keeps numeric API durations and fixed templates without raw logs or identities', () => {
  const text = ['platform token=secret', JSON.stringify({method:'GET',route:'/posts/private-id',status:200,durationMs:3000}), '[Info] ' + JSON.stringify({requestId:'private-id',method:'POST',route:'/comments/:id/moderate',status:200,durationMs:2500,token:'secret',body:'private'})].join('\n');
  const result = edgeLogSummary(text);
  expect(result.available).toBe(true);
  expect(result.slow).toBe(1);
  expect(result.latency.count).toBe(1);
  expect(result.byRoute['POST /comments/:id/moderate'].p95).toBe(2500);
  expect(JSON.stringify(result)).not.toMatch(/secret|private/);
  expect(edgeLogSummary('unavailable').available).toBe(false);
});
