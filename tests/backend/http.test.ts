import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createHandler,
  type CallerBackend,
  type ApiDependencies,
} from '../../supabase/functions/api/handler';
import {
  ApiError,
  decodeCursor,
  encodeCursor,
} from '../../supabase/functions/_shared/contracts';
import inputs from '../fixtures/backend-comment-inputs.json';
import { dbError } from '../../supabase/functions/api/backend';
const id = '20000000-0000-0000-0000-000000000001';
const key = '30000000-0000-0000-0000-000000000001';
const item = {
  id,
  entity_id: id,
  author_id: id,
  parent_id: null,
  body: '<script>text</script>',
  version: 1,
  status: 'pending' as const,
  created_at: '2026-11-14T12:00:00.123456+00:00',
  updated_at: '2026-11-14T12:00:00Z',
  deleted_at: null,
};
let backend: CallerBackend;
let factory: ReturnType<typeof vi.fn<ApiDependencies['backend']>>;
let log: ReturnType<typeof vi.fn<NonNullable<ApiDependencies['log']>>>;
let handler: ReturnType<typeof createHandler>;
function request(path: string, options: RequestInit = {}) {
  return handler(
    new Request(`https://backend.test/functions/v1/api/v1${path}`, options),
  );
}
function write(body: unknown, method = 'POST'): RequestInit {
  return {
    method,
    headers: {
      authorization: 'Bearer valid',
      'content-type': 'application/json',
      'idempotency-key': key,
    },
    body: JSON.stringify(body),
  };
}
beforeEach(() => {
  backend = {
    commentState: vi
      .fn()
      .mockResolvedValue({ source: 'api', epoch: 1, writes_enabled: true }),
    resolveEntity: vi
      .fn()
      .mockResolvedValue({ id, canonical_path: '/hiens-nha/music/' }),
    verifyUser: vi.fn().mockResolvedValue({ id }),
    isOwner: vi.fn().mockResolvedValue(false),
    entityExists: vi.fn().mockResolvedValue(true),
    listComments: vi.fn().mockResolvedValue([]),
    rpc: vi.fn().mockResolvedValue(item),
  };
  factory = vi.fn(() => backend);
  log = vi.fn();
  handler = createHandler({
    backend: factory,
    allowedOrigins: ['http://localhost:4321'],
    log,
  });
});
describe('thin HTTP boundary', () => {
  it('supports anonymous reads, ignores untrusted role headers, returns no-store', async () => {
    const response = await request(`/entities/${id}/comments`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], nextCursor: null });
    expect(backend.verifyUser).not.toHaveBeenCalled();
    expect(factory).toHaveBeenCalledWith(undefined);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('requires and verifies a bearer token; supplied invalid token never falls back to anonymous', async () => {
    expect((await request('/me')).status).toBe(401);
    expect(
      (await request('/me', { headers: { authorization: 'Basic evil' } }))
        .status,
    ).toBe(401);
    vi.mocked(backend.verifyUser).mockRejectedValue(
      new ApiError(401, 'UNAUTHENTICATED', 'Invalid session'),
    );
    expect(
      (
        await request(`/entities/${id}/comments`, {
          headers: { authorization: 'Bearer expired' },
        })
      ).status,
    ).toBe(401);
    expect(backend.listComments).not.toHaveBeenCalled();
    expect(factory).toHaveBeenCalledWith('expired');
  });
  it('denies admin listing for member and supports owner pagination', async () => {
    expect(
      (
        await request('/admin/moderation', {
          headers: { authorization: 'Bearer valid' },
        })
      ).status,
    ).toBe(403);
    vi.mocked(backend.isOwner).mockResolvedValue(true);
    vi.mocked(backend.listComments).mockResolvedValue([item, item]);
    const response = await request('/admin/moderation?limit=1', {
      headers: { authorization: 'Bearer valid' },
    });
    const page = await response.json();
    expect(page.items).toHaveLength(1);
    expect(decodeCursor(page.nextCursor)).toEqual({
      id,
      created_at: item.created_at,
    });
    expect(backend.listComments).toHaveBeenLastCalledWith(null, null, 2, null);
  });
  it('forwards narrowly scoped create input and caller token without accepting author/status', async () => {
    expect(
      (
        await request(
          `/entities/${id}/comments`,
          write({ body: 'hello', authorId: id, status: 'approved' }),
        )
      ).status,
    ).toBe(422);
    const response = await request(
      `/entities/${id}/comments`,
      write({ body: '<script>text only</script>' }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(backend.rpc).toHaveBeenCalledWith('create_comment', {
      p_entity_id: id,
      p_body: '<script>text only</script>',
      p_key: key,
      p_parent_id: null,
    });
  });
  it('validates payload size, version, idempotency key, JSON, cursor and limit', async () => {
    for (const body of inputs.valid)
      expect(
        (await request(`/entities/${id}/comments`, write({ body }))).status,
      ).toBe(200);
    for (const body of inputs.invalid)
      expect(
        (await request(`/entities/${id}/comments`, write({ body }))).status,
      ).toBe(422);
    for (const suffix of [
      '?limit=0',
      '?limit=51',
      '?limit=x',
      '?cursor=evil',
      '?status=approved',
    ])
      expect((await request(`/entities/${id}/comments${suffix}`)).status).toBe(
        422,
      );
    expect(
      (
        await request(
          `/comments/${id}`,
          write({ body: 'x', expectedVersion: 0 }, 'PATCH'),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await request(
          `/entities/${id}/comments`,
          write({ body: 'x'.repeat(17000) }),
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await request(`/entities/${id}/comments`, {
          method: 'POST',
          headers: {
            authorization: 'Bearer valid',
            'content-type': 'application/json',
          },
          body: '{',
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await request(`/entities/${id}/comments`, {
          ...write({ body: 'hi' }),
          headers: {
            authorization: 'Bearer valid',
            'content-type': 'application/json',
          },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await request(
          `/comments/${id}/moderate`,
          write({ status: 'approved', expectedVersion: 1, reason: '' }),
        )
      ).status,
    ).toBe(422);
    expect(() =>
      decodeCursor(encodeCursor({ id, created_at: 'x),id.neq.null' })),
    ).toThrow();
  });
  it('returns committed mutation or DB error; no fake success or SQL/secret log', async () => {
    vi.mocked(backend.rpc).mockRejectedValue(
      new ApiError(409, 'CONFLICT', 'Version conflict'),
    );
    const response = await request(
      `/comments/${id}`,
      write({ body: 'hi', expectedVersion: 1 }, 'PATCH'),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'CONFLICT',
      requestId: expect.any(String),
      fieldErrors: {},
    });
    vi.mocked(backend.rpc).mockRejectedValue(new Error('secret SQL token'));
    const failure = await request(
      `/entities/${id}/comments`,
      write({ body: 'private text' }),
    );
    expect(failure.status).toBe(503);
    expect(JSON.stringify(await failure.json())).not.toContain('secret');
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /private text|Bearer|secret/,
    );
  });
  it('CORS allowlist includes preflight; no-origin clients still need authorization', async () => {
    const response = await request('/me', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:4321' },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:4321',
    );
    const denied = await request('/me', {
      headers: { origin: 'https://evil.test' },
    });
    expect(denied.status).toBe(403);
    expect(denied.headers.has('access-control-allow-origin')).toBe(false);
    expect((await request('/me')).status).toBe(401);
  });
  it('maps quota/permission errors and hides infrastructure diagnostics', async () => {
    expect(() => dbError({ code: 'PT429' })).toThrow(ApiError);
    try {
      dbError({ code: 'PT429' });
    } catch (e) {
      vi.mocked(backend.rpc).mockRejectedValue(e);
    }
    const response = await request(
      `/entities/${id}/comments`,
      write({ body: 'hi' }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    for (const [code, status] of [
      ['PT403', 403],
      ['PT503', 503],
      ['42501', 403],
      ['XX000', 503],
    ] as const) {
      try {
        dbError({ code });
      } catch (e) {
        expect((e as ApiError).status).toBe(status);
      }
    }
  });
});

describe('release telemetry and connection bound', () => {
  it('uses the transport peer, never forwarded headers, and redacts IDs/body/tokens from logs', async () => {
    const admit = vi.fn().mockReturnValue(false);
    const guarded = createHandler({
      backend: factory,
      allowedOrigins: [],
      admitConnection: admit,
      log,
    });
    const response = await guarded(
      new Request('https://api.test/api/v1/posts/' + id + '?private=token', {
        headers: {
          authorization: 'Bearer secret-session',
          'x-forwarded-for': 'forged-peer',
        },
      }),
      'transport-peer',
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(admit).toHaveBeenCalledWith('transport-peer');
    expect(factory).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        route: '/posts/:id',
        durationMs: expect.any(Number),
        code: 'RATE_LIMITED',
      }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /secret-session|private=|forged-peer|transport-peer|10000000/,
    );
  });
});
