import { createApiClient, type CurrentUser } from '../api/client';
import { publicBackendConfig } from '../api/config';
import type { Session } from '@supabase/auth-js';
import type { createAuth } from './session';
export interface AuthSnapshot {
  user: CurrentUser | null;
  busy: boolean;
  error: string | null;
  persistent?: boolean;
}
export type LoginProvider = 'github' | 'google' | 'facebook';
export type BackendRuntime = ReturnType<typeof createBackendRuntime>;
let singleton: BackendRuntime | null = null;
export function getBackendRuntime() {
  const config = publicBackendConfig(import.meta.env);
  if (!config) throw new Error('Backend disabled');
  return (singleton ??= createBackendRuntime(config));
}
export function createBackendRuntime(
  config: NonNullable<ReturnType<typeof publicBackendConfig>>,
) {
  let auth: ReturnType<typeof createAuth> | null = null;
  let snapshot: AuthSnapshot = { user: null, busy: true, error: null };
  const listeners = new Set<(value: AuthSnapshot) => void>();
  const publish = (next: Partial<AuthSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((fn) => fn(snapshot));
  };
  const api = createApiClient(config, async (verifyIdentity) => {
    if (suppressSession || !auth || (!verifyIdentity && !snapshot.user))
      return null;
    const { data, error } = await auth.auth.getSession();
    if (error) throw error;
    if (!verifyIdentity && !snapshot.user) return null;
    return data.session?.access_token ?? null;
  });
  let popup: Window | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let exchanging = false;
  let authGeneration = 0;
  let initializing: Promise<void> | null = null;
  let stopped = false;
  let guestStarting: Promise<void> | null = null;
  let handoff: { proof: string; session: Session } | null = null;
  let suppressSession = false;
  let restoring = false;
  let handoffReady = false;
  const finish = () => {
    if (timer) clearInterval(timer);
    timer = null;
    popup?.close();
    popup = null;
  };
  const fail = (code = 'AUTH_FAILED') => {
    finish();
    if (handoff && auth) {
      const saved = handoff.session;
      handoffReady = false;
      handoff = null;
      restoring = true;
      auth.storage?.beginLogin();
      auth.storage?.setItem(auth.storage.key, JSON.stringify(saved));
      void auth.auth
        .setSession(saved)
        .then(async () => {
          restoring = false;
          await refresh();
          publish({ error: code });
        })
        .catch(() => {
          restoring = false;
          publish({ user: null, busy: false, error: code });
        });
    } else publish({ busy: false, error: code });
  };
  const refresh = async () => {
    await initialize();
    const generation = ++authGeneration;
    publish({ busy: true, error: null });
    try {
      const user = await api.me();
      if (handoff && handoffReady && !user.guest) {
        await api.claimGuest(handoff.proof);
        handoff = null;
      }
      if (generation === authGeneration && !stopped) {
        publish({ user, busy: false, persistent: auth?.storage?.persistent });
      }
    } catch {
      if (generation === authGeneration)
        publish({ user: null, busy: false, error: 'AUTH_FAILED' });
    }
  };
  function initialize() {
    return (initializing ??= (async () => {
      const { createAuth } = await import('./session');
      if (stopped) return;
      auth = createAuth(config);
      auth.auth.onAuthStateChange((event, session) => {
        if (stopped) return;
        if (event === 'SIGNED_OUT') {
          authGeneration++;
          publish({ user: null, busy: false, error: null });
        } else if (
          (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') &&
          !restoring &&
          !exchanging &&
          !suppressSession &&
          !guestStarting
        ) {
          if (snapshot.user && session?.user.id !== snapshot.user.id) {
            authGeneration++;
            publish({ user: null, busy: true });
          }
          // Do not call Auth methods while its event callback holds the SDK lock.
          setTimeout(() => {
            if (!stopped) void refresh();
          }, 0);
        }
      });
    })());
  }
  const ready = initialize()
    .then(async () => {
      const { data, error } = await auth!.auth.getSession();
      if (!stopped && !error && data.session) await refresh();
      else if (!stopped) publish({ busy: false });
    })
    .catch(() => {
      if (!stopped) publish({ busy: false, error: 'AUTH_FAILED' });
    });
  window.addEventListener('pageshow', () => {
    if (!stopped && auth) {
      auth.auth.startAutoRefresh();
      void auth.auth.getSession().then(({ data }) => {
        if (data.session) void refresh();
        else {
          authGeneration++;
          publish({ user: null, busy: false });
        }
      });
    }
  });
  window.addEventListener('storage', (event) => {
    if (event.key === auth?.storage?.key && !stopped) {
      if (event.newValue) void refresh();
      else {
        authGeneration++;
        publish({ user: null, busy: false, error: null });
      }
    }
  });
  window.addEventListener('message', async (event) => {
    if (
      !popup ||
      event.source !== popup ||
      event.origin !== location.origin ||
      exchanging
    )
      return;
    if (event.data?.type === 'hiens-oauth-error') {
      fail();
      return;
    }
    const { oauthCode } = await import('./session');
    const code = oauthCode(event, popup, location.origin);
    if (!code || !auth || exchanging) return;
    exchanging = true;
    try {
      const { error } = await auth.auth.exchangeCodeForSession(code);
      if (error) throw error;
      handoffReady = true;
      finish();
      await refresh();
      if (handoff) fail('GUEST_CLAIM_FAILED');
    } catch {
      fail();
    } finally {
      exchanging = false;
    }
  });
  window.addEventListener('pagehide', (event) => {
    finish();
    auth?.auth.stopAutoRefresh();
    if (!(event as PageTransitionEvent).persisted) {
      stopped = true;
      listeners.clear();
    }
  });
  return {
    api,
    ready,
    ensureSocialIdentity() {
      return (guestStarting ??= (async () => {
        await ready;
        if (snapshot.user) return;
        if (snapshot.busy) throw new Error('Authentication in progress');
        suppressSession = false;
        auth!.storage?.beginLogin();
        publish({ busy: true, error: null });
        try {
          const { error } = await auth!.auth.signInAnonymously();
          if (error) throw error;
          await refresh();
          if (!snapshot.user) throw Error('Guest identity unavailable');
        } catch (error) {
          publish({ busy: false, error: 'GUEST_UNAVAILABLE' });
          throw error;
        }
      })().finally(() => {
        guestStarting = null;
      }));
    },
    current: () => snapshot,
    subscribe(fn: (value: AuthSnapshot) => void) {
      listeners.add(fn);
      fn(snapshot);
      return () => listeners.delete(fn);
    },
    refresh,
    async signIn(redirectPath: string, provider: LoginProvider = 'github') {
      if (snapshot.busy) return;
      if (!['github', 'google', 'facebook'].includes(provider)) return;
      popup = window.open(
        'about:blank',
        'hiens-auth',
        'popup,width=600,height=720',
      );
      if (!popup) {
        fail('POPUP_BLOCKED');
        return;
      }
      publish({ busy: true, error: null });
      const started = Date.now();
      timer = setInterval(() => {
        if (!exchanging && (popup?.closed || Date.now() - started > 300000))
          fail('AUTH_CANCELLED');
      }, 500);
      try {
        await initialize();
        if (snapshot.user?.guest) {
          const { data } = await auth!.auth.getSession();
          if (!data.session) throw Error('Guest session missing');
          const proof = crypto.randomUUID();
          await api.guestIdentity(undefined, false, proof);
          handoffReady = false;
          handoff = { proof, session: data.session };
        }
        suppressSession = false;
        if (!handoff) auth?.storage?.beginLogin();
        const redirect = new URL(redirectPath, location.origin);
        if (redirect.origin !== location.origin)
          throw new Error('Invalid callback');
        const { data, error } = await auth!.auth.signInWithOAuth({
          provider,
          options: { redirectTo: redirect.href, skipBrowserRedirect: true },
        });
        if (error || !data.url || !popup || popup.closed) throw error;
        popup.location.href = data.url;
      } catch {
        fail();
      }
    },
    async signOut() {
      if (!auth || snapshot.busy) return;
      suppressSession = true;
      handoff = null;
      finish();
      const generation = ++authGeneration;
      publish({ busy: true, error: null });
      try {
        const { error } = await auth.auth.signOut({ scope: 'local' });
        if (error) throw error;
        if (generation === authGeneration) publish({ user: null, busy: false });
      } catch {
        if (generation === authGeneration)
          publish({ user: null, busy: false, error: 'SIGNOUT_FAILED' });
      } finally {
        auth.storage?.clear();
      }
    },
  };
}
