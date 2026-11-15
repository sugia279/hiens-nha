import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { publicBackendConfig } from '../src/lib/api/config';
import { publicKey } from '../supabase/functions/_shared/contracts';

/** Validate before Vite embeds PUBLIC_* literals, including auth-only/Git-source builds. */
export function validatePublicBackendBuild(env: Record<string, unknown>): boolean {
  if (env.PUBLIC_BACKEND_ENABLED && !['true', 'false'].includes(String(env.PUBLIC_BACKEND_ENABLED))) {
    throw new Error('Invalid backend flag');
  }
  if (env.PUBLIC_SUPABASE_PUBLISHABLE_KEY) publicKey(env.PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  return publicBackendConfig(env) !== null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const enabled = validatePublicBackendBuild(process.env);
    console.log(enabled ? 'Public backend configuration validated.' : 'Backend remains disabled.');
  } catch {
    console.error('Invalid public backend configuration; values are intentionally omitted.');
    process.exitCode = 1;
  }
}
