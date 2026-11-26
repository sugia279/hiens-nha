// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({
  session: null as any,
  changed: null as any,
  signup: vi.fn(),
  exchange: vi.fn(),
  restore: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('../../src/lib/auth/session', () => ({
  createAuth: () => ({
    storage: {
      key: 'guest-test',
      persistent: true,
      beginLogin() {},
      setItem() {},
      clear() {},
    },
    auth: {
      getSession: async () => ({ data: { session: sdk.session }, error: null }),
      onAuthStateChange: (fn: any) => {
        sdk.changed = fn;
      },
      signInAnonymously: sdk.signup,
      exchangeCodeForSession: sdk.exchange,
      setSession: sdk.restore,
      signOut: sdk.logout,
      signInWithOAuth: async () => ({
        data: { url: 'https://provider.example/authorize' },
        error: null,
      }),
      startAutoRefresh() {},
      stopAutoRefresh() {},
    },
  }),
  oauthCode: (event: MessageEvent, popup: Window, origin: string) =>
    event.source === popup &&
    event.origin === origin &&
    event.data?.type === 'hiens-oauth-code'
      ? event.data.code
      : null,
}));
import { createBackendRuntime } from '../../src/lib/auth/runtime';
const config = {
  supabaseUrl: 'http://127.0.0.1:54321',
  apiBase: 'http://127.0.0.1:54321/functions/v1/api/v1',
  publishableKey: 'sb_publishable_fixture',
};
const guest = {
    access_token: 'guest-jwt',
    refresh_token: 'guest-refresh',
    user: { id: 'guest', is_anonymous: true },
  },
  member = {
    access_token: 'member-jwt',
    refresh_token: 'member-refresh',
    user: { id: 'member', is_anonymous: false },
  };
let fetcher: ReturnType<typeof vi.fn>, popup: any;
beforeEach(() => {
  sdk.session = null;
  sdk.signup.mockReset();
  sdk.exchange.mockReset();
  sdk.restore.mockReset();
  sdk.logout.mockReset();
  sdk.signup.mockImplementation(async () => {
    sdk.session = guest;
    sdk.changed('SIGNED_IN', guest);
    return { error: null };
  });
  sdk.exchange.mockImplementation(async () => {
    sdk.session = member;
    sdk.changed('SIGNED_IN', member);
    return { error: null };
  });
  sdk.restore.mockImplementation(async (session: any) => {
    sdk.session = session;
    sdk.changed('SIGNED_IN', session);
    return { error: null };
  });
  sdk.logout.mockImplementation(async () => ({
    error: new Error('Network signout failure'),
  }));
  fetcher = vi.fn(
    async (input: RequestInfo | URL) =>
      new Response(
        JSON.stringify(
          String(input).endsWith('/me')
            ? {
                id: sdk.session?.user.id,
                role: 'member',
                ...(sdk.session?.user.is_anonymous ? { guest: true } : {}),
              }
            : String(input).endsWith('guest_claim')
              ? true
              : { chosen: false, display_name: 'Người Lạ' },
        ),
      ),
  );
  vi.stubGlobal('fetch', fetcher);
  popup = {
    closed: false,
    location: { href: '' },
    close() {
      this.closed = true;
    },
  };
  vi.spyOn(window, 'open').mockReturnValue(popup);
});
afterEach(() => {
  window.dispatchEvent(new Event('pagehide'));
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('coalesces first guest signup across surfaces and does not race the SIGNED_IN refresh', async () => {
  const runtime = createBackendRuntime(config);
  await Promise.all([
    runtime.ensureSocialIdentity(),
    runtime.ensureSocialIdentity(),
  ]);
  expect(sdk.signup).toHaveBeenCalledTimes(1);
  expect(runtime.current()).toMatchObject({
    user: { id: 'guest', guest: true },
    busy: false,
    error: null,
  });
});
it('redeems only after the checked OAuth callback using the new account JWT', async () => {
  const runtime = createBackendRuntime(config);
  await runtime.ensureSocialIdentity();
  await runtime.signIn('/hiens-nha/account/callback/', 'google');
  expect(
    fetcher.mock.calls.some((c) => String(c[0]).endsWith('guest_claim')),
  ).toBe(false);
  window.dispatchEvent(
    new MessageEvent('message', {
      origin: location.origin,
      source: popup,
      data: { type: 'hiens-oauth-code', code: 'verified-code' },
    }),
  );
  await vi.waitFor(() => expect(runtime.current().user?.id).toBe('member'));
  const claim = fetcher.mock.calls.find((c) =>
    String(c[0]).endsWith('guest_claim'),
  )!;
  expect(new Headers(claim[1]?.headers).get('authorization')).toBe(
    'Bearer member-jwt',
  );
  expect(sdk.signup).toHaveBeenCalledTimes(1);
  expect(sdk.restore).not.toHaveBeenCalled();
});
it('restores the guest after failed OAuth and retains the handoff source interaction', async () => {
  const runtime = createBackendRuntime(config);
  await runtime.ensureSocialIdentity();
  sdk.exchange.mockResolvedValueOnce({ error: Error('Provider refused') });
  await runtime.signIn('/hiens-nha/account/callback/', 'facebook');
  window.dispatchEvent(
    new MessageEvent('message', {
      origin: location.origin,
      source: popup,
      data: { type: 'hiens-oauth-code', code: 'failed-code' },
    }),
  );
  await vi.waitFor(() => expect(sdk.restore).toHaveBeenCalledWith(guest));
  await vi.waitFor(() =>
    expect(runtime.current()).toMatchObject({
      user: { id: 'guest', guest: true },
      busy: false,
      error: 'AUTH_FAILED',
    }),
  );
  expect(
    fetcher.mock.calls.some((c) => String(c[0]).endsWith('guest_claim')),
  ).toBe(false);
});
it('restores the guest after closing the provider popup', async () => {
  const runtime = createBackendRuntime(config);
  await runtime.ensureSocialIdentity();
  vi.useFakeTimers();
  await runtime.signIn('/hiens-nha/account/callback/', 'google');
  popup.closed = true;
  await vi.advanceTimersByTimeAsync(500);
  expect(sdk.restore).toHaveBeenCalledWith(guest);
  expect(runtime.current()).toMatchObject({
    user: { id: 'guest' },
    busy: false,
    error: 'AUTH_CANCELLED',
  });
});
it('clears local authority even when signout fails; stale SDK refresh cannot sign the owner back in', async () => {
  sdk.session = member;
  const runtime = createBackendRuntime(config);
  await runtime.ready;
  await runtime.signOut();
  sdk.changed('TOKEN_REFRESHED', member);
  await runtime.api.comments('public-entity');
  expect(runtime.current()).toMatchObject({
    user: null,
    busy: false,
    error: 'SIGNOUT_FAILED',
  });
  const call = fetcher.mock.calls.at(-1)!;
  expect(new Headers(call[1]?.headers).has('authorization')).toBe(false);
});
