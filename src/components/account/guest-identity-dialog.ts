const element = <K extends keyof HTMLElementTagNameMap>(tag: K) =>
  document.createElement(tag);
import type { BackendRuntime, LoginProvider } from '../../lib/auth/runtime';

export type SocialRuntime = Pick<
  BackendRuntime,
  'api' | 'current' | 'subscribe'
> &
  Partial<Pick<BackendRuntime, 'ensureSocialIdentity' | 'signIn'>>;
const pending = new WeakMap<object, Promise<void>>();
/** Called after commit only. A single prompt serves concurrent surfaces. */
export function identifyGuest(
  runtime: SocialRuntime,
  vi: boolean,
  base: string,
  signal: AbortSignal,
): Promise<void> {
  if (!runtime.current().user?.guest || signal.aborted)
    return Promise.resolve();
  const existing = pending.get(runtime);
  if (existing) return existing;
  const task = show().finally(() => pending.delete(runtime));
  pending.set(runtime, task);
  return task;
  async function show() {
    const actor = runtime.current().user?.id;
    const identity = await runtime.api.guestIdentity();
    if (
      identity.chosen ||
      signal.aborted ||
      runtime.current().user?.id !== actor
    )
      return;
    await new Promise<void>((resolve) => {
      const copy = (a: string, b: string) => (vi ? a : b);
      const dialog = element('dialog');
      dialog.dataset.guestIdentity = '';
      dialog.className = 'social-dialog';
      const title = element('h2');
      title.id = 'guest-identity-title';
      title.textContent = copy(
        'Cho Hiển biết bạn là ai nha',
        'Let Hien know who you are',
      );
      dialog.setAttribute('aria-labelledby', title.id);
      const label = element('label');
      label.textContent = copy('Tên của bạn', 'Your name');
      const name = element('input');
      name.name = 'guest-name';
      name.maxLength = 60;
      name.autocomplete = 'name';
      label.append(name);
      const status = element('p');
      status.setAttribute('role', 'status');
      const providers: HTMLButtonElement[] = [];
      let available: Record<LoginProvider, boolean> | null = null;
      const ok = element('button');
      ok.type = 'button';
      ok.textContent = 'OK';
      const cancel = element('button');
      cancel.type = 'button';
      cancel.textContent = copy('Hủy', 'Cancel');
      let saving = false,
        closed = false,
        unsubscribe = () => {};
      function close() {
        if (closed) return;
        closed = true;
        unsubscribe();
        signal.removeEventListener('abort', close);
        dialog.close();
        dialog.remove();
        resolve();
      }
      function update() {
        const auth = runtime.current();
        if (!auth.user?.guest) {
          close();
          return;
        }
        ok.disabled = cancel.disabled = saving || auth.busy;
        providers.forEach(
          (b) =>
            (b.disabled =
              saving ||
              auth.busy ||
              !available?.[b.dataset.provider as LoginProvider]),
        );
        if (auth.error)
          status.textContent = copy(
            'Đăng nhập chưa xong. Tương tác đã lưu.',
            'Sign-in failed. Your interaction is saved.',
          );
      }
      async function choose(value: string | null) {
        if (saving || runtime.current().busy) return;
        if (value !== null && !value.trim()) {
          status.textContent = copy(
            'Nhập tên hoặc chọn Hủy.',
            'Enter a name or choose Cancel.',
          );
          name.focus();
          return;
        }
        saving = true;
        update();
        try {
          await runtime.api.guestIdentity(value, true);
          close();
        } catch {
          status.textContent = copy(
            'Chưa lưu được tên. Tương tác đã lưu; thử lại.',
            'Name not saved. Interaction saved; retry.',
          );
        } finally {
          saving = false;
          update();
        }
      }
      dialog.append(title, label);
      for (const provider of ['google', 'facebook'] as const) {
        const b = element('button');
        b.type = 'button';
        b.dataset.provider = provider;
        b.textContent =
          copy('Tiếp tục với ', 'Continue with ') +
          (provider === 'google' ? 'Google' : 'Facebook');
        b.disabled = true;
        b.addEventListener('click', () => {
          if (available?.[provider])
            void runtime.signIn?.(
              `${base}${vi ? '' : 'en/'}account/callback/`,
              provider,
            );
        });
        providers.push(b);
        dialog.append(b);
      }
      dialog.append(status, ok, cancel);
      ok.addEventListener('click', () => void choose(name.value));
      cancel.addEventListener('click', () => void choose(null));
      name.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          void choose(name.value);
        }
      });
      dialog.addEventListener('cancel', (e) => {
        e.preventDefault();
        void choose(null);
      });
      signal.addEventListener('abort', close, { once: true });
      document.body.append(dialog);
      dialog.showModal();
      name.focus();
      unsubscribe = runtime.subscribe(update);
      if (closed) unsubscribe();
      void runtime.api
        .authProviders()
        .then((value) => {
          if (closed) return;
          available = value;
          providers.forEach((b) => {
            if (!available![b.dataset.provider as LoginProvider])
              b.textContent += copy(' · Chưa bật', ' · Unavailable');
          });
          update();
        })
        .catch(() => {
          if (!closed)
            status.textContent = copy(
              'Chưa tải được đăng nhập. Nhập tên hoặc chọn Hủy.',
              'Sign-in unavailable. Enter a name or Cancel.',
            );
        });
    });
  }
}
