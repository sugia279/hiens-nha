import { getBackendRuntime } from '../../lib/auth/runtime';
import { mountModerationQueue } from './moderation';
import { onPageMount } from '../../lib/page-lifecycle';
onPageMount((page) => {
for (const panel of document.querySelectorAll<HTMLElement>('[data-moderation-queue]')) {
  try { page.cleanup(mountModerationQueue(panel, getBackendRuntime())); }
  catch { panel.querySelector('[data-queue-status]')!.textContent = panel.dataset.locale === 'vi' ? 'Kết nối quản trị chưa sẵn sàng.' : 'Admin connection unavailable.'; }
}

});
