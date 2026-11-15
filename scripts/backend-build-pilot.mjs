import { spawnSync } from 'node:child_process';
// Public dummy key is sufficient to compile. Real integration overwrites public config only.
const env = { ...process.env, PUBLIC_BACKEND_ENABLED: 'true', PUBLIC_COMMENTS_MODE: 'api-local', PUBLIC_CONTENT_MODE:'api-local', PUBLIC_REQUESTS_MODE:'api-local',
  PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', PUBLIC_API_BASE: 'http://127.0.0.1:54321/functions/v1/api/v1',
  PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.LOCAL_PUBLISHABLE_KEY ?? 'sb_publishable_local_build_fixture' };
for (const [cli, args] of [['astro', ['build', '--outDir', '.pilot-dist']], ['pagefind', ['--site', '.pilot-dist']]]) {
  const result = spawnSync(process.execPath, [`node_modules/${cli === 'astro' ? 'astro/bin/astro.mjs' : 'pagefind/lib/runner/bin.cjs'}`, ...args], { env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
