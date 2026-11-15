import { getBackendRuntime } from '../../lib/auth/runtime';
import { mountModerationQueue } from './moderation';
for (const panel of document.querySelectorAll<HTMLElement>('[data-moderation-queue]')) {
  try { mountModerationQueue(panel, getBackendRuntime()); }
  catch { panel.querySelector('[data-queue-status]')!.textContent = panel.dataset.locale === 'vi' ? 'Kết nối quản trị chưa sẵn sàng.' : 'Admin connection unavailable.'; }
}
