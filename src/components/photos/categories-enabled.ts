import { getBackendRuntime } from '../../lib/auth/runtime';
import { onPageMount } from '../../lib/page-lifecycle';
import { mountPhotoCategories } from './categories';

onPageMount(page => {
  page.cleanup(mountPhotoCategories(document, getBackendRuntime(), document.documentElement.lang === 'vi'));
});
