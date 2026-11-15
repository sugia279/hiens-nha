import markers from '../../config/feature-sources.json';
import { validateSource } from '../../supabase/functions/_shared/source-mode.mjs';
import { publicBackendConfig } from './api/config';
export type Feature = 'posts' | 'media' | 'requests';
export function featureSource(
  feature: Feature,
  env: Record<string, unknown>,
): { source: 'git' | 'api'; epoch: number } {
  if (markers.version !== 1)
    throw new Error('Unsupported feature source version');
  const marker = validateSource(markers[feature]);
  const override =
    env[
      feature === 'requests' ? 'PUBLIC_REQUESTS_MODE' : 'PUBLIC_CONTENT_MODE'
    ];
  if (override === 'api-local') {
    const config = publicBackendConfig(env);
    if (
      !config ||
      !['localhost', '127.0.0.1', '[::1]'].includes(
        new URL(config.supabaseUrl).hostname,
      )
    )
      throw new Error('Local API feature requires loopback backend');
    return { source: 'api', epoch: 1 };
  }
  if (override && override !== marker.source)
    throw new Error('Hosted feature source must match repository marker');
  if (marker.source === 'api' && !publicBackendConfig(env))
    throw new Error('API feature requires backend');
  return { source: marker.source as 'git' | 'api', epoch: marker.epoch };
}
