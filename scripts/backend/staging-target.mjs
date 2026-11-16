export const stagingRef = 'hitsdflorbqvoltsytxe';
export const stagingUrl = `https://${stagingRef}.supabase.co`;
export const stagingPooler = 'aws-1-ap-southeast-1.pooler.supabase.com';

/** Validate before any network, client, fixture or database construction. Never echo input. */
export function stagingCredentials(env, args) {
  if (args.length !== 1 || !['--confirm-staging-ci', '--confirm-staging-full'].includes(args[0]))
    throw Error('STAGING_CONFIRMATION_REQUIRED');
  let db, claims;
  try {
    db = new URL(env.STAGING_DB_URL);
    const parts = env.STAGING_SERVICE_ROLE_KEY.split('.');
    if (parts.length !== 3) throw 0;
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!['postgres:', 'postgresql:'].includes(db.protocol) ||
        db.hostname !== stagingPooler || db.port !== '5432' || db.pathname !== '/postgres' || db.hash ||
        decodeURIComponent(db.username) !== `postgres.${stagingRef}` || !db.password ||
        [...db.searchParams].some(([k,v]) => k !== 'sslmode' || v !== 'verify-full') ||
        claims.ref !== stagingRef || claims.role !== 'service_role' || !Number.isSafeInteger(claims.exp) || claims.exp <= Date.now()/1000 ||
        !/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.STAGING_PUBLISHABLE_KEY ?? '')) throw 0;
  } catch { throw Error('STAGING_CREDENTIALS_INVALID'); }
  // postgres.js receives only our explicit verified TLS options; no caller query options.
  db.search = '';
  return { database: db.href, host: db.hostname, key: env.STAGING_PUBLISHABLE_KEY,
    adminKey: env.STAGING_SERVICE_ROLE_KEY, url: stagingUrl,
    profile: args[0] === '--confirm-staging-full' ? 'full' : 'ci' };
}

export function stagingFetch(input, init = {}) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
  if (url.origin !== stagingUrl || url.username || url.password) throw Error('STAGING_HTTP_TARGET_INVALID');
  return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(10000) });
}
