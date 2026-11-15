/** Per-worker connection bound only. Forwarded headers never establish an identity. */
export function connectionBudget({
  rate = 160,
  burst = 320,
  maxKeys = 4096,
  now = () => performance.now(),
} = {}) {
  if (![rate, burst, maxKeys].every((n) => Number.isSafeInteger(n) && n > 0))
    throw new Error('Invalid connection budget');
  const buckets = new Map<string, { tokens: number; time: number }>();
  return (connection: string) => {
    const time = now(),
      key = connection || 'unknown';
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= maxKeys) buckets.delete(buckets.keys().next().value!);
      bucket = { tokens: burst, time };
      buckets.set(key, bucket);
    }
    bucket.tokens = Math.min(
      burst,
      bucket.tokens + (Math.max(0, time - bucket.time) * rate) / 1000,
    );
    bucket.time = time;
    if (bucket.tokens < 1) return false;
    bucket.tokens--;
    return true;
  };
}
export function routeTemplate(path: string) {
  const route = path.replace(/^\/functions\/v1/, '').replace(/^\/api\/v1/, '');
  if (
    /^\/(posts|media|requests)(\/[^/]+)?(\/(submit|moderate|unpublish|revisions|scope|transitions|events|corrections))?$/.test(
      route,
    )
  )
    return route.replace(/^\/(posts|media|requests)\/[^/]+/, '/$1/:id');
  if (/^\/requests\/legacy\/\d+$/.test(route))
    return '/requests/legacy/:number';
  if (/^\/entities\/[^/]+\/comments$/.test(route))
    return '/entities/:id/comments';
  if (/^\/comments\/[^/]+(?:\/moderate)?$/.test(route))
    return route.replace(/^\/comments\/[^/]+/, '/comments/:id');
  if (
    [
      '/health',
      '/me',
      '/state',
      '/comments',
      '/entities/resolve',
      '/admin/moderation',
      '/admin/publications',
      '/admin/requests',
      '/me/content',
    ].includes(route)
  )
    return route;
  if (/^\/features\/(posts|media|requests)\/state$/.test(route)) return route;
  return 'unknown';
}
