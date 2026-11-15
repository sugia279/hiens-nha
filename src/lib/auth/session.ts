import { AuthClient } from '@supabase/auth-js';
import type { BackendConfig } from '../api/config';

/** No token or PKCE verifier is persisted. Reloading this page ends its local session. */
export function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
export function createAuth(config: BackendConfig) {
  return { auth: new AuthClient({
    url: `${config.supabaseUrl}/auth/v1`,
    headers: { apikey: config.publishableKey, Authorization: `Bearer ${config.publishableKey}` },
    storageKey: `hiens-auth-${crypto.randomUUID()}`,
    flowType: 'pkce', storage: memoryStorage(), persistSession: true, detectSessionInUrl: false, autoRefreshToken: true,
  }) };
}
export function oauthCode(event: Pick<MessageEvent, 'origin' | 'source' | 'data'>, popup: Window | null, origin: string): string | null {
  if (!popup || event.source !== popup || event.origin !== origin || event.data?.type !== 'hiens-oauth-code' || typeof event.data.code !== 'string' || !/^[a-zA-Z0-9_-]{1,2048}$/.test(event.data.code)) return null;
  return event.data.code;
}
