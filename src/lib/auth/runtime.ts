import { createApiClient, type CurrentUser } from '../api/client';
import { publicBackendConfig } from '../api/config';
import type { createAuth } from './session';
export interface AuthSnapshot { user: CurrentUser | null; busy: boolean; error: string | null }
export type BackendRuntime = ReturnType<typeof createBackendRuntime>;
let singleton: BackendRuntime | null = null;
export function getBackendRuntime() {
  const config = publicBackendConfig(import.meta.env);
  if (!config) throw new Error('Backend disabled');
  return singleton ??= createBackendRuntime(config);
}
export function createBackendRuntime(config: NonNullable<ReturnType<typeof publicBackendConfig>>) {
  let auth: ReturnType<typeof createAuth> | null = null;
  let snapshot: AuthSnapshot = { user: null, busy: false, error: null };
  const listeners = new Set<(value: AuthSnapshot) => void>();
  const publish = (next: Partial<AuthSnapshot>) => { snapshot = { ...snapshot, ...next }; listeners.forEach(fn => fn(snapshot)); };
  const api = createApiClient(config, async (verifyIdentity) => {
    if (!auth || (!verifyIdentity && !snapshot.user)) return null;
    const { data, error } = await auth.auth.getSession();
    if (error) throw error;
    if (!verifyIdentity && !snapshot.user) return null;
    return data.session?.access_token ?? null;
  });
  let popup: Window | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let exchanging = false;
  let authGeneration = 0;
  const finish = () => { if (timer) clearInterval(timer); timer = null; popup?.close(); popup = null; };
  const fail = (code = 'AUTH_FAILED') => { finish(); publish({ user: null, busy: false, error: code }); };
  const refresh = async () => {
    const generation = ++authGeneration;
    publish({ busy: true, error: null });
    try { const user = await api.me(); if (generation === authGeneration) publish({ user, busy: false }); }
    catch { if (generation === authGeneration) publish({ user: null, busy: false, error: 'AUTH_FAILED' }); }
  };
  window.addEventListener('message', async event => {
    if (!popup || event.source !== popup || event.origin !== location.origin || exchanging) return;
    if (event.data?.type === 'hiens-oauth-error') { fail(); return; }
    const { oauthCode } = await import('./session');
    const code = oauthCode(event, popup, location.origin);
    if (!code || !auth || exchanging) return;
    exchanging = true;
    try {
      const { error } = await auth.auth.exchangeCodeForSession(code); if (error) throw error;
      finish(); await refresh();
    } catch { fail(); }
    finally { exchanging = false; }
  });
  window.addEventListener('pagehide', () => { finish(); auth?.auth.stopAutoRefresh(); listeners.clear(); });
  return {
    api,
    current: () => snapshot,
    subscribe(fn: (value: AuthSnapshot) => void) { listeners.add(fn); fn(snapshot); return () => listeners.delete(fn); },
    refresh,
    async signIn(redirectPath: string) {
      if (snapshot.busy) return;
      popup = window.open('about:blank', 'hiens-auth', 'popup,width=600,height=720');
      if (!popup) { fail('POPUP_BLOCKED'); return; }
      publish({ busy: true, error: null });
      const started = Date.now();
      timer = setInterval(() => { if (!exchanging && (popup?.closed || Date.now() - started > 300000)) fail('AUTH_CANCELLED'); }, 500);
      try {
        if (!auth) {
          const { createAuth } = await import('./session'); auth = createAuth(config);
          auth.auth.onAuthStateChange(event => {
            if (event === 'SIGNED_OUT') { authGeneration++; publish({ user: null, busy: false, error: null }); }
          });
        }
        const redirect = new URL(redirectPath, location.origin);
        if (redirect.origin !== location.origin) throw new Error('Invalid callback');
        const { data, error } = await auth.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: redirect.href, skipBrowserRedirect: true } });
        if (error || !data.url || !popup || popup.closed) throw error;
        popup.location.href = data.url;
      } catch { fail(); }
    },
    async signOut() {
      if (!auth || snapshot.busy) return;
      const generation = ++authGeneration;
      publish({ busy: true, error: null });
      try { const { error } = await auth.auth.signOut({ scope: 'local' }); if (error) throw error; if (generation === authGeneration) publish({ user: null, busy: false }); }
      catch { if (generation === authGeneration) publish({ busy: false, error: 'SIGNOUT_FAILED' }); }
    },
  };
}
