import { getBackendRuntime } from '../../lib/auth/runtime';
for (const panel of document.querySelectorAll<HTMLElement>('[data-backend-panel]')) {
  const status = panel.querySelector<HTMLElement>('[data-auth-status]')!;
  const login = panel.querySelector<HTMLButtonElement>('[data-sign-in]')!;
  const logout = panel.querySelector<HTMLButtonElement>('[data-sign-out]')!;
  const refresh = panel.querySelector<HTMLButtonElement>('[data-refresh]')!;
  const vi = panel.dataset.locale === 'vi';
  const say = (a: string, b: string) => { status.textContent = vi ? a : b; };
  try {
    const runtime = getBackendRuntime();
    runtime.subscribe(({ user, busy, error }) => {
      login.hidden = !!user; logout.hidden = !user; refresh.hidden = !user && !error;
      login.disabled = logout.disabled = refresh.disabled = busy;
      if (error === 'POPUP_BLOCKED') say('Cho phép cửa sổ đăng nhập rồi thử lại.', 'Allow the sign-in popup and retry.');
      else if (error) say('Chưa xác minh được phiên. Vui lòng thử lại.', 'Session could not be verified. Please retry.');
      else if (busy) say('Đang xác minh…', 'Verifying…');
      else if (user && panel.dataset.admin === 'true' && user.role !== 'owner') say('Tài khoản này không có quyền quản trị.', 'This account has no admin access.');
      else if (user) say(user.role === 'owner' ? 'Đã xác minh chủ nhà.' : 'Đã đăng nhập.', user.role === 'owner' ? 'Owner verified.' : 'Signed in.');
      else say('Đăng nhập để gửi và quản lý bình luận của mình.', 'Sign in to send and manage your own comments.');
    });
    login.addEventListener('click', () => void runtime.signIn(panel.dataset.callback!));
    logout.addEventListener('click', () => void runtime.signOut());
    refresh.addEventListener('click', () => void runtime.refresh());
  } catch { say('Kết nối đăng nhập chưa sẵn sàng.', 'Sign-in connection is unavailable.'); }
}
