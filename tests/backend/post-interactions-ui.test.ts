// @vitest-environment happy-dom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mountPostInteractions } from '../../src/components/content/post-interactions';
import { openSignIn } from '../../src/components/account/sign-in-dialog';
import type { AuthSnapshot, BackendRuntime } from '../../src/lib/auth/runtime';
import type { Publication } from '../../supabase/functions/_shared/features';

const row = {
  id: '20000000-0000-0000-0000-000000000001',
  entity_id: '30000000-0000-0000-0000-000000000001',
  published_revision: 1,
} as Publication;
const summary = { post_id: row.id, heart: 0, laugh: 0, wow: 0, mine: null };
function fixture(user: AuthSnapshot['user'] = { id: 'a', role: 'member' }) {
  let snapshot: AuthSnapshot = { user, busy: false, error: null };
  const listeners = new Set<(s: AuthSnapshot) => void>();
  const api = {
    authProviders: vi
      .fn()
      .mockResolvedValue({ github: true, google: true, facebook: false }),
    postReactions: vi.fn().mockResolvedValue([summary]),
    setPostReaction: vi
      .fn()
      .mockResolvedValue({ ...summary, heart: 1, mine: 'heart' }),
  };
  const runtime = {
    api,
    signIn: vi.fn(),
    current: () => snapshot,
    subscribe(fn: (s: AuthSnapshot) => void) {
      listeners.add(fn);
      fn(snapshot);
      return () => listeners.delete(fn);
    },
  } as unknown as BackendRuntime;
  const card = document.createElement('article');
  document.body.append(card);
  const controller = mountPostInteractions(card, row, runtime, {
    vi: true,
    base: '/hiens-nha/',
    template: null,
    expanded: new Set(),
  });
  controller.update(summary);
  return {
    card,
    controller,
    runtime,
    api,
    listeners,
    set(next: Partial<AuthSnapshot>) {
      snapshot = { ...snapshot, ...next };
      listeners.forEach((fn) => fn(snapshot));
    },
  };
}
beforeEach(() => {
  document.body.innerHTML =
    '<template data-sign-in-template><dialog data-login-dialog><button data-login-provider="github">GitHub</button><button data-login-provider="google">Google</button><button data-login-provider="facebook">Facebook</button><p data-login-status role="status"></p><button data-login-retry hidden>Retry</button><button data-login-close>Close</button></dialog></template>';
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(
    function (this: HTMLDialogElement) {
      this.open = true;
    },
  );
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.open = false;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
it('gates every guest icon with a disposable chooser and disables unavailable providers', async () => {
  const f = fixture(null);
  for (const selector of [
    '[data-reaction="heart"]',
    '[data-post-comments]',
    '[data-post-share]',
  ]) {
    f.card.querySelector<HTMLButtonElement>(selector)!.click();
    await vi.waitFor(() =>
      expect(
        document.querySelector<HTMLButtonElement>(
          '[data-login-provider="github"]',
        )!.disabled,
      ).toBe(false),
    );
    expect(
      document.querySelector<HTMLButtonElement>(
        '[data-login-provider="facebook"]',
      )!.disabled,
    ).toBe(true);
    document.querySelector<HTMLButtonElement>('[data-login-close]')!.click();
    expect(f.listeners.size).toBe(0);
  }
  expect(f.api.setPostReaction).not.toHaveBeenCalled();
  f.card.querySelector<HTMLButtonElement>('[data-reaction="heart"]')!.click();
  await vi.waitFor(() =>
    expect(
      document.querySelector<HTMLButtonElement>(
        '[data-login-provider="google"]',
      )!.disabled,
    ).toBe(false),
  );
  document
    .querySelector<HTMLButtonElement>('[data-login-provider="google"]')!
    .click();
  expect(f.runtime.signIn).toHaveBeenCalledWith(
    '/hiens-nha/account/callback/',
    'google',
  );
  f.controller.dispose();
  expect(document.querySelector('[data-login-dialog]')).toBeNull();
  expect(f.listeners.size).toBe(0);
});
it('keeps failed reaction intent retryable and ignores a late mutation after identity loss', async () => {
  const f = fixture();
  const heart = f.card.querySelector<HTMLButtonElement>(
    '[data-reaction="heart"]',
  )!;
  f.api.setPostReaction.mockRejectedValueOnce(Error('offline'));
  heart.click();
  await vi.waitFor(() => expect(heart.disabled).toBe(false));
  expect(heart.getAttribute('aria-pressed')).toBe('false');
  let resolve!: (value: unknown) => void;
  f.api.setPostReaction.mockImplementationOnce(
    () => new Promise((r) => (resolve = r)),
  );
  heart.click();
  expect(f.api.setPostReaction.mock.calls.map((c) => c[1])).toEqual([
    'heart',
    'heart',
  ]);
  f.set({ user: null });
  resolve({ ...summary, heart: 1, mine: 'heart' });
  await vi.waitFor(() => expect(heart.disabled).toBe(false));
  expect(heart.getAttribute('aria-pressed')).toBe('false');
  f.controller.dispose();
});
it('ignores a batched read started before a successful reaction', async () => {
  const f = fixture();
  const version = f.controller.version();
  const heart = f.card.querySelector<HTMLButtonElement>(
    '[data-reaction="heart"]',
  )!;
  heart.click();
  await vi.waitFor(() =>
    expect(heart.getAttribute('aria-pressed')).toBe('true'),
  );
  f.controller.update(summary, version);
  f.controller.failure(version);
  expect(heart.getAttribute('aria-pressed')).toBe('true');
  expect(f.card.querySelector('[role="status"]')!.textContent).toBe('');
  f.controller.dispose();
});
it('offers a selectable safe link when clipboard is unavailable; private posts cannot share/react', async () => {
  const f = fixture();
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(Error('denied'));
  f.card.querySelector<HTMLButtonElement>('[data-post-share]')!.click();
  await vi.waitFor(() =>
    expect(
      f.card.querySelector<HTMLInputElement>('.post-share-link')!.hidden,
    ).toBe(false),
  );
  expect(f.card.querySelector<HTMLInputElement>('input')!.value).toContain(
    `/hiens-nha/community/post/?id=${row.id}#post-comments`,
  );
  f.controller.dispose();
  const card = document.createElement('article');
  const stop = mountPostInteractions(
    card,
    { ...row, published_revision: null },
    f.runtime,
    { vi: false, base: '/hiens-nha/', template: null, expanded: new Set() },
  );
  expect(
    [
      ...card.querySelectorAll<HTMLButtonElement>(
        '[data-reaction],[data-post-share]',
      ),
    ].every((b) => b.disabled),
  ).toBe(true);
  stop.dispose();
});
it('retries provider discovery without inventing availability and closes on verified sign-in', async () => {
  const f = fixture(null);
  f.api.authProviders.mockRejectedValueOnce(Error('offline'));
  const signal = new AbortController();
  openSignIn(
    f.runtime,
    false,
    '/hiens-nha/en/account/callback/',
    signal.signal,
  );
  await vi.waitFor(() =>
    expect(
      document.querySelector<HTMLButtonElement>('[data-login-retry]')!.hidden,
    ).toBe(false),
  );
  expect(
    document.querySelector<HTMLButtonElement>('[data-login-provider="github"]')!
      .disabled,
  ).toBe(true);
  document.querySelector<HTMLButtonElement>('[data-login-retry]')!.click();
  await vi.waitFor(() =>
    expect(
      document.querySelector<HTMLButtonElement>(
        '[data-login-provider="github"]',
      )!.disabled,
    ).toBe(false),
  );
  f.set({ user: { id: 'a', role: 'member' } });
  expect(document.querySelector('[data-login-dialog]')).toBeNull();
  expect(f.listeners.size).toBe(0);
  f.controller.dispose();
});
