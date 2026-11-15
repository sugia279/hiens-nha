import http from 'k6/http';
import { check } from 'k6';
import { Trend, Rate } from 'k6/metrics';
const latency = new Trend('text_api_latency', true);
const failures = new Rate('text_api_failure');
const base = __ENV.API_BASE;
if (__ENV.ALLOW_LOAD_TEST !== 'local-or-staging' || !base || !__ENV.ENTITY_ID || !__ENV.PUBLISHABLE_KEY) throw new Error('Explicit local/staging test configuration required');
const stages = [
  ['warmup', 10, '2m', '0s'], ['steady10', 10, '5m', '2m'], ['steady20', 20, '5m', '7m'],
  ['burst50', 50, '30s', '12m'], ['recovery10', 10, '2m', '12m30s'],
];
export const options = {
  scenarios: Object.fromEntries(stages.map(([name, rate, duration, startTime]) => [name, {
    executor: 'constant-arrival-rate', rate, timeUnit: '1s', duration, startTime, preAllocatedVUs: 30, maxVUs: 150,
    tags: { stage: name }, gracefulStop: '0s',
  }])),
  thresholds: Object.assign({ dropped_iterations: ['count==0'], text_api_failure: ['rate==0'] },
    ...stages.map(([stage]) => ({ [`text_api_latency{stage:${stage}}`]: ['p(95)<2000'] }))),
};
export default function () {
  const headers = { apikey: __ENV.PUBLISHABLE_KEY };
  if (__ENV.ACCESS_TOKEN) headers.Authorization = `Bearer ${__ENV.ACCESS_TOKEN}`;
  const response = http.get(`${base}/entities/${__ENV.ENTITY_ID}/comments?limit=20`, { headers, timeout: '10s', redirects: 0 });
  const ok = check(response, { 'read succeeds': r => r.status === 200, 'page DTO': r => { try { return Array.isArray(r.json().items); } catch { return false; } } });
  failures.add(!ok); latency.add(response.timings.duration);
}
