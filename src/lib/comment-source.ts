import marker from '../../config/comments-source.json';
import { publicBackendConfig } from './api/config';
export function commentSource(env: Record<string, unknown>): { source: 'git' | 'api'; epoch: number } {
  if (marker.version !== 1 || !['git', 'api'].includes(marker.source) || !Number.isSafeInteger(marker.epoch) || (marker.source === 'api' && marker.epoch < 1)) throw new Error('Invalid comments source marker');
  if (env.PUBLIC_COMMENTS_MODE === 'api-local') {
    const config = publicBackendConfig(env);
    if (!config || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(config.supabaseUrl).hostname)) throw new Error('api-local requires a loopback Supabase project');
    return { source: 'api', epoch: 1 };
  }
  if (env.PUBLIC_COMMENTS_MODE && env.PUBLIC_COMMENTS_MODE !== marker.source) throw new Error('Hosted comments mode must match the repository marker');
  if (marker.source === 'api' && !publicBackendConfig(env)) throw new Error('API comments require configured backend');
  return { source: marker.source as 'git' | 'api', epoch: marker.epoch };
}
