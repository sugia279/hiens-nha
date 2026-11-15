import { getBackendRuntime } from '../../lib/auth/runtime';
import { mountComments } from './controller';
import { onPageMount } from '../../lib/page-lifecycle';
onPageMount((page) => {
for (const element of document.querySelectorAll<HTMLElement>('[data-api-comments]')) {
  if(element.dataset.deferred==='true')continue;
  try { page.cleanup(mountComments(element, getBackendRuntime())); }
  catch { element.querySelector('[data-comments-status]')!.textContent = element.dataset.locale === 'vi' ? 'Kết nối bình luận chưa sẵn sàng.' : 'Comments connection unavailable.'; }
}

});
