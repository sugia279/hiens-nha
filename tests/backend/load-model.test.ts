import { describe, expect, it } from 'vitest';
import {
  loadStages,
  percentile,
  runArrivals,
} from '../../scripts/backend/load-model.mjs';
describe('open-arrival load measurement', () => {
  it('keeps full planned phase durations and computes nearest-rank tail latency', () => {
    expect(loadStages('full').map((s) => [s.rate, s.seconds])).toEqual([
      [10, 120],
      [10, 300],
      [20, 300],
      [50, 30],
      [10, 120],
    ]);
    expect(percentile([1, 2, 3, 4000], 0.95)).toBe(4000);
    expect(() => loadStages('unknown')).toThrow();
  });
  it('records failed operations and generator drops instead of reporting false throughput', async () => {
    let t = 0;
    const now = () => t;
    const result = await runArrivals(
      { name: 'test', rate: 10, seconds: 1 },
      async (i: number) => ({
        kind: i % 5 === 0 ? 'write:post' : 'public',
        status: i === 3 ? 503 : 200,
        ok: i !== 3,
      }),
      {
        now,
        wait: async (ms) => {
          t += ms;
          await Promise.resolve();
        },
      },
    );
    expect(result).toMatchObject({
      offered: 10,
      launched: 10,
      failures: 1,
      passed: false,
    });
    expect(result.statuses[503]).toBe(1);
    let first = true;
    const dropped = await runArrivals(
      { name: 'late', rate: 10, seconds: 1 },
      async () => {
        if (first) {
          first = false;
          t += 2000;
        }
        return { kind: 'write:post', status: 200, ok: true };
      },
      {
        now,
        wait: async (ms) => {
          t += ms;
        },
      },
    );
    expect(dropped.dropped).toBeGreaterThan(0);
    expect(dropped.passed).toBe(false);
  });
  it('retains the strict latency failure with bounded numeric slow diagnostics', async () => {
    let t = 0;
    const result = await runArrivals({name:'slow',rate:1,seconds:1}, async () => {
      t += 2500;
      return {status:200,ok:true,kind:'write:comments',body:'private',token:'secret'};
    }, {now:()=>t,wait:async ms=>{t+=ms;}});
    expect(result.passed).toBe(false);
    expect(result.slowOperations).toEqual([{offsetMs:0,durationMs:2500,status:200,kind:'write:comments'}]);
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});
