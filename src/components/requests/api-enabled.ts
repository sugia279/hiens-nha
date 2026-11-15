import { getBackendRuntime } from '../../lib/auth/runtime';
import { mountRequests } from './api-controller';
const runtime = getBackendRuntime();
document
  .querySelectorAll<HTMLElement>('[data-api-requests]')
  .forEach((panel) => mountRequests(panel, runtime));
