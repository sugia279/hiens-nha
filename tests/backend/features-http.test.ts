import { describe, expect, it, vi } from 'vitest';
import { featureRequest } from '../../supabase/functions/api/feature-handler';
import { featurePayload } from '../../supabase/functions/_shared/features';
import { featureSource } from '../../src/lib/feature-source';
import sourceMarkers from '../../config/feature-sources.json';
const id = '10000000-0000-0000-0000-000000000001',
  key = '20000000-0000-0000-0000-000000000001';
const post = {
  title: 'Safe post',
  body: 'one\ntwo',
  kind: 'poem',
  category: 'Thơ',
  tags: 'a, a',
  series: '',
  order: 1,
};
const backend = { rpc: vi.fn().mockResolvedValue({ id }) };
const call = (
  route: string,
  method = 'GET',
  body?: unknown,
  user: { id: string } | null = { id },
) =>
  featureRequest(
    new Request('https://api.test' + route, {
      method,
      headers: { 'idempotency-key': key },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    route.split('?')[0]!,
    backend,
    user,
    (r) => r.json(),
  );
describe('feature HTTP contracts', () => {
  it('maps normalized payload and actor-independent input to transactional RPCs', async () => {
    await call('/posts', 'POST', post);
    expect(backend.rpc).toHaveBeenLastCalledWith(
      'publication_write',
      expect.objectContaining({
        p_feature: 'posts',
        p_action: 'create',
        p_key: key,
        p_payload: { ...post, tags: ['a'] },
      }),
    );
    await call(`/posts/${id}/moderate`, 'POST', {
      expectedVersion: 2,
      revision: 1,
      decision: 'approve',
      reason: 'Reviewed',
    });
    expect(backend.rpc).toHaveBeenLastCalledWith(
      'publication_write',
      expect.objectContaining({
        p_action: 'approve',
        p_revision: 1,
        p_expected_version: 2,
      }),
    );
    await call(`/requests/${id}/transitions`, 'POST', {
      expectedVersion: 3,
      scopeRevision: 2,
      status: 'completed',
      message: 'Done',
      result: 'Report',
    });
    expect(backend.rpc).toHaveBeenLastCalledWith(
      'request_write',
      expect.objectContaining({
        p_action: 'transition',
        p_scope_revision: 2,
        p_expected_version: 3,
      }),
    );
  });
  it('denies missing identity and rejects unknown authority fields', async () => {
    await expect(call('/posts', 'POST', post, null)).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      call('/posts', 'POST', { ...post, author_id: id }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      call(`/requests/${id}/transitions`, 'POST', {
        expectedVersion: 1,
        status: 'completed',
        message: 'Done',
        result: 'Report',
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      call('/media', 'POST', {
        title: 'unsafe',
        description: '',
        category: 'video',
        url: 'javascript:alert(1)',
        tags: [],
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(featurePayload('posts', post).body).toBe('one\ntwo');
  });
  it('enforces independent deployed markers, required API backend and loopback-only rehearsal overrides', () => {
    const hosted = {
      PUBLIC_BACKEND_ENABLED: 'true', PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co',
      PUBLIC_API_BASE: 'https://fixture.supabase.co/functions/v1/api/v1',
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
    };
    const local = {...hosted, PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321',
      PUBLIC_API_BASE:'http://127.0.0.1:54321/functions/v1/api/v1'};
    for (const feature of ['posts', 'media', 'requests'] as const) {
      const marker=sourceMarkers[feature];
      expect(featureSource(feature,hosted)).toEqual(marker);
      if(marker.source==='api') expect(()=>featureSource(feature,{})).toThrow('API feature requires backend');
      else expect(featureSource(feature,{})).toEqual(marker);
      const key=feature==='requests'?'PUBLIC_REQUESTS_MODE':'PUBLIC_CONTENT_MODE';
      const other=marker.source==='git'?'api':'git';
      expect(()=>featureSource(feature,{...hosted,[key]:other})).toThrow('Hosted feature source must match repository marker');
      expect(()=>featureSource(feature,{[key]:'api-local'})).toThrow('Local API feature requires loopback backend');
      expect(()=>featureSource(feature,{...hosted,[key]:'api-local'})).toThrow('Local API feature requires loopback backend');
      expect(featureSource(feature,{...local,[key]:'api-local'})).toEqual({source:'api',epoch:1});
    }
  });
  it('preserves numeric request mapping without interpreting it as a UUID', async () => {
    await call('/requests/legacy/14');
    expect(backend.rpc).toHaveBeenLastCalledWith('request_legacy', {
      p_number: 14,
    });
  });
});
