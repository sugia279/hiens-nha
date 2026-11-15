import { it, expect } from 'vitest';
import { validatePublicBackendBuild } from '../../scripts/validate-public-backend';

it('blocks privileged keys before public bundling, even when source features remain Git', () => {
  const env = {
    PUBLIC_BACKEND_ENABLED: 'true',
    PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co',
    PUBLIC_API_BASE: 'https://fixture.supabase.co/functions/v1/api/v1',
    PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_build_fixture',
  };
  expect(validatePublicBackendBuild(env)).toBe(true);
  const roleKey = 'eyJhbGciOiJIUzI1NiJ9.' + btoa(JSON.stringify({ role: 'service_role' })) + '.fixture';
  for (const key of ['sb_secret_fixture', roleKey]) {
    expect(() => validatePublicBackendBuild({ ...env, PUBLIC_SUPABASE_PUBLISHABLE_KEY: key })).toThrow();
    expect(() => validatePublicBackendBuild({ ...env, PUBLIC_BACKEND_ENABLED: 'false', PUBLIC_SUPABASE_PUBLISHABLE_KEY: key })).toThrow();
  }
  expect(() => validatePublicBackendBuild({ ...env, PUBLIC_API_BASE: 'https://other.supabase.co/functions/v1/api/v1' })).toThrow();
  expect(() => validatePublicBackendBuild({ PUBLIC_BACKEND_ENABLED: 'TRUE' })).toThrow();
  expect(validatePublicBackendBuild({})).toBe(false);
});
