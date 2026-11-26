import { getBackendRuntime } from '../../lib/auth/runtime';
import { onPageMount } from '../../lib/page-lifecycle';
onPageMount((page) => {
for (const panel of document.querySelectorAll<HTMLElement>('[data-backend-panel]')) {
  const status = panel.querySelector<HTMLElement>('[data-auth-status]')!;
  const login = panel.querySelector<HTMLButtonElement>('[data-sign-in]')!;
  const logout = panel.querySelector<HTMLButtonElement>('[data-sign-out]')!;
  const refresh = panel.querySelector<HTMLButtonElement>('[data-refresh]')!;
  const vi = panel.dataset.locale === 'vi';
  const say = (a: string, b: string) => { status.textContent = vi ? a : b; };
  try {
    const runtime = getBackendRuntime();
    page.cleanup(runtime.subscribe(({ user, busy, error, persistent }) => {
      const note=panel.querySelector<HTMLElement>('[data-session-note]');
      if(note&&persistent===false)note.textContent=vi?'Trình duyệt không cho lưu phiên; đăng nhập chỉ được giữ trong tab hiện tại.':'Browser storage is unavailable; this session lasts only in the current tab.';
      login.hidden = !!user && !user.guest; logout.hidden = !user || user.guest === true; refresh.hidden = !user && !error;
      login.disabled = logout.disabled = refresh.disabled = busy;
      if (error === 'POPUP_BLOCKED') say('Cho phép cửa sổ đăng nhập rồi thử lại.', 'Allow the sign-in popup and retry.');
      else if (error) say('Chưa xác minh được phiên. Vui lòng thử lại.', 'Session could not be verified. Please retry.');
      else if (busy) say('Đang xác minh…', 'Verifying…');
      else if (user && panel.dataset.admin === 'true' && user.role !== 'owner') say('Tài khoản này không có quyền quản trị.', 'This account has no admin access.');
      else if(user?.guest) say('Bạn có thể bình luận và bày tỏ cảm xúc.','You can comment and react.');
      else if (user) say(user.role === 'owner' ? 'Đã xác minh chủ nhà.' : 'Đã đăng nhập.', user.role === 'owner' ? 'Owner verified.' : 'Signed in.');
      else say('Đăng nhập để gửi và quản lý bình luận của mình.', 'Sign in to send and manage your own comments.');
    }));
    login.addEventListener('click', () => void runtime.signIn(panel.dataset.callback!));
    logout.addEventListener('click', () => void runtime.signOut());
    refresh.addEventListener('click', () => void runtime.refresh());
  } catch { say('Kết nối đăng nhập chưa sẵn sàng.', 'Sign-in connection is unavailable.'); }
}

});
