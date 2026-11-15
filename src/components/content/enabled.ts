import { getBackendRuntime } from '../../lib/auth/runtime';
import { mountPublications } from './publications';
import { onPageMount } from '../../lib/page-lifecycle';
onPageMount((page) => {
for (const panel of document.querySelectorAll<HTMLElement>(
  '[data-publications]',
)) {
  try {
    page.cleanup(mountPublications(panel, getBackendRuntime()));
  } catch {
    panel.querySelector('[data-feature-status]')!.textContent =
      panel.dataset.locale === 'vi'
        ? 'Kết nối nội dung chưa sẵn sàng.'
        : 'Content connection unavailable.';
  }
}

});
