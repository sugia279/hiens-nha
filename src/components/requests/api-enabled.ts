import { getBackendRuntime } from '../../lib/auth/runtime';
import { mountRequests } from './api-controller';
import { onPageMount } from '../../lib/page-lifecycle';
onPageMount((page) => {
const runtime = getBackendRuntime();
document
  .querySelectorAll<HTMLElement>('[data-api-requests]')
  .forEach((panel) => page.cleanup(mountRequests(panel, runtime)));

});
