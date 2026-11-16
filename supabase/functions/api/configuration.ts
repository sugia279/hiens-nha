import { hostedDeployment, stagingDeployment } from '../_shared/hosted-deployment.ts';

/** Hosted origin fallbacks use exact approved projects; local/deny overrides stay explicit. */
export function apiOrigins(supabaseUrl: string, configured?: string): string[] {
  if (configured !== undefined) {
    const values = configured.split(',').map((s) => s.trim()).filter(Boolean);
    for (const value of values) {
      try {
        const origin = new URL(value);
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
        if (origin.origin !== value || (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:'))) throw Error();
      } catch { throw new Error('Invalid API origin allowlist'); }
    }
    return [...new Set(values)];
  }
  const deployment = [hostedDeployment, stagingDeployment].find(d => new URL(supabaseUrl).origin === d.supabaseUrl);
  return deployment ? [deployment.browserOrigin] : [];
}
