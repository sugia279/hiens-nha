import { describe, expect, it, vi } from 'vitest';
import { publicBackendConfig } from '../../src/lib/api/config';
import { createApiClient } from '../../src/lib/api/client';
import { memoryStorage, oauthCode } from '../../src/lib/auth/session';
const config = { supabaseUrl: 'http://127.0.0.1:54321', apiBase: 'http://127.0.0.1:54321/functions/v1/api/v1', publishableKey: 'sb_publishable_fixture' };
const env = { PUBLIC_BACKEND_ENABLED: 'true', PUBLIC_SUPABASE_URL: config.supabaseUrl, PUBLIC_API_BASE: config.apiBase, PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.publishableKey };
describe('browser foundation contracts', () => {
  it('is disabled by default and refuses secret keys or cross-project token destinations', () => {
    expect(publicBackendConfig({})).toBeNull(); expect(publicBackendConfig(env)).toEqual(config);
    for (const key of ['sb_secret_test', 'service-role', `a.${btoa('{"role":"service_role"}')}.c`]) expect(() => publicBackendConfig({ ...env, PUBLIC_SUPABASE_PUBLISHABLE_KEY: key })).toThrow();
    for (const url of ['https://evil.example/functions/v1/api/v1', 'http://127.0.0.1:54321/functions/v1/api/v1?token=x']) expect(() => publicBackendConfig({ ...env, PUBLIC_API_BASE: url })).toThrow();
    expect(() => publicBackendConfig({ ...env, PUBLIC_SUPABASE_URL: 'http://remote.example', PUBLIC_API_BASE: 'http://remote.example/functions/v1/api/v1' })).toThrow();
  });
  it('keeps session storage isolated in memory and accepts only matching-origin popup codes', () => {
    const first = memoryStorage(), second = memoryStorage(); first.setItem('token', 'private');
    expect(first.getItem('token')).toBe('private'); expect(second.getItem('token')).toBeNull(); first.removeItem('token'); expect(first.getItem('token')).toBeNull();
    const popup = {} as Window; const event = { origin: 'https://site.example', source: popup, data: { type: 'hiens-oauth-code', code: 'code-123' } };
    expect(oauthCode(event, popup, 'https://site.example')).toBe('code-123');
    expect(oauthCode({ ...event, origin: 'https://evil.example' }, popup, 'https://site.example')).toBeNull();
    expect(oauthCode({ ...event, source: {} as Window }, popup, 'https://site.example')).toBeNull();
    expect(oauthCode(event, null, 'https://site.example')).toBeNull();
  });
  it('sends caller bearer + idempotency key and never retries mutations automatically', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: 'x', status: 'pending' }), { status: 200 }));
    const api = createApiClient(config, async () => 'caller-session', fetcher);
    await api.createComment('entity-id', '<b>plain text</b>', 'retry-key');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe(config.apiBase + '/entities/entity-id/comments');
    expect(new Headers(options?.headers).get('authorization')).toBe('Bearer caller-session');
    expect(new Headers(options?.headers).get('idempotency-key')).toBe('retry-key');
    expect(options).toMatchObject({ redirect: 'error', credentials: 'omit', cache: 'no-store' });
  });
  it('keeps API errors and timeout failures distinct from an empty successful page', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ code: 'CONFLICT', message: 'Refresh' }), { status: 409 }));
    const api = createApiClient(config, async () => null, fetcher);
    await expect(api.comments('id')).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });
    fetcher.mockRejectedValue(new Error('timeout'));
    await expect(api.comments('id')).rejects.toMatchObject({ status: 503, code: 'UNAVAILABLE' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
