import { getBackendRuntime } from '../../lib/auth/runtime';
import { mountPublications } from './publications';
for (const panel of document.querySelectorAll<HTMLElement>(
  '[data-publications]',
)) {
  try {
    mountPublications(panel, getBackendRuntime());
  } catch {
    panel.querySelector('[data-feature-status]')!.textContent =
      panel.dataset.locale === 'vi'
        ? 'Kết nối nội dung chưa sẵn sàng.'
        : 'Content connection unavailable.';
  }
}
