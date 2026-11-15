import { publicKey } from '../../../supabase/functions/_shared/contracts';
export interface BackendConfig { supabaseUrl: string; publishableKey: string; apiBase: string }
export function publicBackendConfig(env: Record<string, unknown>): BackendConfig | null {
  if (env.PUBLIC_BACKEND_ENABLED !== 'true') return null;
  const supabase = new URL(String(env.PUBLIC_SUPABASE_URL));
  const api = new URL(String(env.PUBLIC_API_BASE));
  for (const url of [supabase, api]) {
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('Invalid backend URL');
  }
  if (api.origin !== supabase.origin || api.pathname.replace(/\/$/, '') !== '/functions/v1/api/v1' || supabase.pathname !== '/') throw new Error('API must belong to the configured Supabase project');
  const key = publicKey(env.PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  return { supabaseUrl: supabase.origin, apiBase: api.href.replace(/\/$/, ''), publishableKey: key };
}
