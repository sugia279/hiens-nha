import { readFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSource } from '../../supabase/functions/_shared/source-mode.mjs';

// Offline compilation only. Never used by the production Pages deployment.
export function offlineBuildEnv(comments, features) {
  if (comments?.version !== 1 || features?.version !== 1) throw new Error('Unsupported source version');
  const markers = [comments, ...['posts', 'media', 'requests'].map(f => features[f])].map(validateSource);
  return {
    PUBLIC_BACKEND_ENABLED: String(markers.some(m => m.source === 'api')),
    PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co',
    PUBLIC_API_BASE: 'https://fixture.supabase.co/functions/v1/api/v1',
    PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_ci_build_fixture',
    PUBLIC_COMMENTS_MODE: '', PUBLIC_CONTENT_MODE: '', PUBLIC_REQUESTS_MODE: '',
  };
}
export function readBuildSources() {
  return ['comments-source.json', 'feature-sources.json'].map(name =>
    JSON.parse(readFileSync(new URL('../../config/' + name, import.meta.url), 'utf8')));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2 || !process.env.GITHUB_ENV) throw new Error('GitHub build environment destination required');
  const env = offlineBuildEnv(...readBuildSources());
  appendFileSync(process.env.GITHUB_ENV, Object.entries(env).map(([k,v]) => `${k}=${v}\n`).join(''));
  console.log(JSON.stringify({ offlineCompilation: true, backendEnabled: env.PUBLIC_BACKEND_ENABLED === 'true' }));
}
