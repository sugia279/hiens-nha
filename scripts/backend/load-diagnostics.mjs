import { routeTemplate } from '../../supabase/functions/api/traffic.ts';
import { metric } from './load-model.mjs';

/** Extract only our fixed labels and numeric durations; never forward raw platform logs. */
export function edgeLogSummary(text) {
  const routes = {}, durations = [];
  let slow = 0;
  for (const line of text.split('\n')) {
    const start = line.indexOf('{'), end = line.lastIndexOf('}');
    if (start < 0 || end < start) continue;
    let event;
    try { event = JSON.parse(line.slice(start, end + 1)); } catch { continue; }
    if (!event || !['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'].includes(event.method) ||
      typeof event.route !== 'string' || routeTemplate(event.route) !== event.route ||
      !Number.isInteger(event.status) || event.status < 100 || event.status > 599 ||
      !Number.isFinite(event.durationMs) || event.durationMs < 0 || event.durationMs > 3600000) continue;
    durations.push(event.durationMs);
    (routes[event.method + ' ' + event.route] ??= []).push(event.durationMs);
    if (event.durationMs >= 1000) slow++;
  }
  return { available: durations.length > 0, latency: metric(durations), slow, byRoute: Object.fromEntries(Object.entries(routes).map(([key, values]) => [key, metric(values)])) };
}
