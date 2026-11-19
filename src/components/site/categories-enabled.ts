import { getBackendRuntime } from '../../lib/auth/runtime';
import { onPageMount } from '../../lib/page-lifecycle';
import { mountContentCategories } from './content-categories';
onPageMount(page => { page.cleanup(mountContentCategories(document,getBackendRuntime(),document.documentElement.lang === 'vi')); });
