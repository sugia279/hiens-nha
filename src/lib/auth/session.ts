import { AuthClient } from '@supabase/auth-js';
import { deviceStorage } from './device-storage';
import type { BackendConfig } from '../api/config';

/** Ephemeral storage remains available for tests and PKCE-only data. */
export function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
export function createAuth(config: BackendConfig) {
  const storageKey = `hiens-auth:${new URL(config.supabaseUrl).host}:${import.meta.env.BASE_URL ?? '/hiens-nha/'}`;
  let local: Storage | null = null;
  try { local = window.localStorage; } catch {}
  const storage = deviceStorage(storageKey, local);
  return { storage, auth: new AuthClient({
    url: `${config.supabaseUrl}/auth/v1`,
    headers: { apikey: config.publishableKey, Authorization: `Bearer ${config.publishableKey}` },
    storageKey,
    flowType: 'pkce', storage, persistSession: true, detectSessionInUrl: false, autoRefreshToken: true,
  }) };
}
export function oauthCode(event: Pick<MessageEvent, 'origin' | 'source' | 'data'>, popup: Window | null, origin: string): string | null {
  if (!popup || event.source !== popup || event.origin !== origin || event.data?.type !== 'hiens-oauth-code' || typeof event.data.code !== 'string' || !/^[a-zA-Z0-9_-]{1,2048}$/.test(event.data.code)) return null;
  return event.data.code;
}
