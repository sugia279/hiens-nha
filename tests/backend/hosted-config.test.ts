import { it, expect } from 'vitest';
import { apiOrigins } from '../../supabase/functions/api/configuration';
import { hostedDeployment } from '../../supabase/functions/_shared/hosted-deployment';

it('scopes the hosted CORS fallback to one project and preserves explicit local/deny overrides', () => {
  expect(apiOrigins(hostedDeployment.supabaseUrl)).toEqual([hostedDeployment.browserOrigin]);
  expect(apiOrigins('https://other.supabase.co')).toEqual([]);
  expect(apiOrigins('http://127.0.0.1:54321')).toEqual([]);
  expect(apiOrigins(hostedDeployment.supabaseUrl, '')).toEqual([]);
  expect(apiOrigins('http://127.0.0.1:54321', 'http://127.0.0.1:4321,http://127.0.0.1:4321')).toEqual(['http://127.0.0.1:4321']);
});
it('rejects wildcard, path, credentials and insecure non-local origins before starting the handler', () => {
  for (const origin of ['*', 'https://sugia279.github.io/hiens-nha/', 'https://user:password@example.test', 'http://example.test']) {
    expect(() => apiOrigins(hostedDeployment.supabaseUrl, origin)).toThrow('Invalid API origin allowlist');
  }
});
