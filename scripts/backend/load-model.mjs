export function loadStages(profile) {
  if (!['ci', 'full'].includes(profile))
    throw new Error('Profile must be ci or full');
  return [
    ['warmup', 10, profile === 'full' ? 120 : 5],
    ['steady10', 10, profile === 'full' ? 300 : 20],
    ['steady20', 20, profile === 'full' ? 300 : 20],
    ['burst50', 50, profile === 'full' ? 30 : 10],
    ['recovery10', 10, profile === 'full' ? 120 : 10],
  ].map(([name, rate, seconds]) => ({ name, rate, seconds }));
}
export function percentile(samples, p) {
  if (!samples.length) return null;
  const ordered = [...samples].sort((a, b) => a - b);
  return (
    Math.round(ordered[Math.max(0, Math.ceil(p * ordered.length) - 1)] * 100) /
    100
  );
}
export function metric(samples) {
  return {
    count: samples.length,
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    p99: percentile(samples, 0.99),
    max: samples.length ? Math.round(Math.max(...samples) * 100) / 100 : null,
  };
}
export async function runArrivals(
  stage,
  operation,
  {
    now = () => performance.now(),
    wait = (ms) => new Promise((r) => setTimeout(r, ms)),
    maxInflight = 150,
  } = {},
) {
  const started = now(),
    running = new Set(),
    samples = [],
    lag = [],
    classes = {},
    statuses = {};
  let dropped = 0,
    failures = 0,
    launched = 0,
    writes = 0, peakInflight = 0;
  const count = stage.rate * stage.seconds;
  for (let i = 0; i < count; i++) {
    const due = started + (i * 1000) / stage.rate;
    const delay = due - now();
    if (delay > 0) await wait(delay);
    const late = now() - due;
    lag.push(Math.max(0, late));
    if (late > 1000 || running.size >= maxInflight) {
      dropped++;
      continue;
    }
    launched++;
    const requestStarted = now();
    const promise = (async () => {
      let r;
      try {
        r = await operation(i);
      } catch {
        r = { status: 0, ok: false, kind: 'transport' };
      }
      const elapsed = now() - requestStarted;
      samples.push(elapsed);
      (classes[r.kind] ??= []).push(elapsed);
      statuses[r.status] = (statuses[r.status] ?? 0) + 1;
      if (!r.ok) failures++;
      if (r.kind.startsWith('write')) writes++;
    })();
    running.add(promise);peakInflight=Math.max(peakInflight,running.size);
    void promise.finally(() => running.delete(promise));
  }
  await Promise.all(running);
  const elapsed = now() - started;
  const result = {
    ...stage,
    offered: count,
    launched,
    achievedRps: launched / stage.seconds,
    completed: samples.length,
    peakInflight,maxInflight,
    dropped,
    failures,
    writeFraction: launched ? writes / launched : 0,
    latency: metric(samples),
    byClass: Object.fromEntries(
      Object.entries(classes).map(([key, value]) => [key, metric(value)]),
    ),
    statuses,
    generatorLag: metric(lag),
    drainMs: Math.max(0, Math.round(elapsed - stage.seconds * 1000)),
  };
  result.passed =
    dropped === 0 &&
    failures === 0 &&
    launched === count &&
    result.latency.p95 !== null &&
    result.latency.p95 < 2000 &&
    Object.values(result.byClass).every(value=>value.p95!==null&&value.p95<2000) &&
    result.writeFraction >= 0.18;
  return result;
}
