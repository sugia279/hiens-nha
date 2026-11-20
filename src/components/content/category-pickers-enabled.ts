import { getBackendRuntime } from '../../lib/auth/runtime';
import { onPageMount } from '../../lib/page-lifecycle';
import { mountCategoryPickers } from './category-pickers';

onPageMount(page => {
  page.cleanup(mountCategoryPickers(document, getBackendRuntime(), document.documentElement.lang === 'vi'));
});
