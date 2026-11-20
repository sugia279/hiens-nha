import type { BackendRuntime, LoginProvider } from '../../lib/auth/runtime';

type Runtime = Pick<BackendRuntime, 'api' | 'subscribe' | 'current'> &
  Partial<Pick<BackendRuntime, 'signIn'>>;
export function openSignIn(
  runtime: Runtime,
  vi: boolean,
  callback: string,
  signal?: AbortSignal,
) {
  const existing = document.querySelector<HTMLDialogElement>(
    '[data-login-dialog]',
  );
  if (existing) {
    existing.focus();
    return;
  }
  const copy = (a: string, b: string) => (vi ? a : b);
  const template = document.querySelector<HTMLTemplateElement>(
    '[data-sign-in-template]',
  );
  if (!template) return;
  const dialog = template.content.firstElementChild!.cloneNode(
    true,
  ) as HTMLDialogElement;
  const status = dialog.querySelector<HTMLElement>('[data-login-status]')!;
  const buttons = [
    ...dialog.querySelectorAll<HTMLButtonElement>('[data-login-provider]'),
  ];
  let available: Record<LoginProvider, boolean> | null = null;
  let disposed = false;
  for (const button of buttons) {
    const provider = button.dataset.loginProvider as LoginProvider;
    button.addEventListener('click', () => {
      if (available?.[provider]) void runtime.signIn?.(callback, provider);
    });
  }
  const retry = dialog.querySelector<HTMLButtonElement>('[data-login-retry]')!;
  const update = () => {
    const { user, busy, error } = runtime.current();
    if (user) {
      dispose();
      return;
    }
    buttons.forEach((button) => {
      button.disabled =
        busy ||
        !available?.[button.dataset.loginProvider as LoginProvider] ||
        !runtime.signIn;
    });
    status.textContent =
      error === 'POPUP_BLOCKED'
        ? copy(
            'Cho phép cửa sổ đăng nhập rồi thử lại.',
            'Allow the sign-in popup and retry.',
          )
        : error
          ? copy(
              'Chưa đăng nhập được. Vui lòng thử lại.',
              'Sign-in did not complete. Please retry.',
            )
          : busy
            ? copy('Đang xác minh…', 'Verifying…')
            : '';
  };
  const load = async () => {
    retry.hidden = true;
    status.textContent = copy(
      'Đang tải cách đăng nhập…',
      'Loading sign-in options…',
    );
    try {
      available = await runtime.api.authProviders();
      if (disposed) return;
      buttons.forEach((button) => {
        if (!available![button.dataset.loginProvider as LoginProvider])
          button.textContent += copy(' · Chưa bật', ' · Unavailable');
      });
      update();
    } catch {
      if (disposed) return;
      status.textContent = copy(
        'Không tải được cách đăng nhập.',
        'Could not load sign-in options.',
      );
      retry.hidden = false;
    }
  };
  let unsubscribe = () => {};
  function dispose() {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    signal?.removeEventListener('abort', dispose);
    dialog.close();
    dialog.remove();
  }
  document.body.append(dialog);
  dialog
    .querySelector('[data-login-close]')!
    .addEventListener('click', dispose);
  dialog.addEventListener('cancel', dispose);
  retry.addEventListener('click', () => void load());
  signal?.addEventListener('abort', dispose, { once: true });
  dialog.showModal();
  unsubscribe = runtime.subscribe(update);
  if (disposed) unsubscribe();
  else void load();
}
