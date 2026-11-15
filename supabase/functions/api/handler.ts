import {
  ApiError,
  bodyText,
  decodeCursor,
  encodeCursor,
  inputObject,
  uuid,
  version,
  type Comment,
  type Cursor,
  type CommentState,
  type ContentEntity,
} from '../_shared/contracts.ts';
import {
  isFeatureRoute,
  featureRequest,
  type FeatureBackend,
} from './feature-handler.ts';
import { routeTemplate } from './traffic.ts';
import { canonicalPageContext } from '../_shared/page-context.ts';

export interface CallerBackend {
  features?: FeatureBackend;
  commentState(): Promise<CommentState>;
  resolveEntity(path: string): Promise<ContentEntity | null>;
  verifyUser(): Promise<{ id: string }>;
  isOwner(): Promise<boolean>;
  entityExists(id: string): Promise<boolean>;
  listComments(
    entityId: string | null,
    cursor: Cursor | null,
    limit: number,
    parentId?: string | null,
    authorId?: string,
    feed?: boolean,
  ): Promise<Comment[]>;
  rpc(name: string, args: Record<string, unknown>): Promise<Comment>;
}
export interface ApiDependencies {
  backend(token?: string): CallerBackend;
  allowedOrigins: string[];
  siteBase?: string;
  log?: (event: {
    requestId: string;
    method: string;
    status: number;
    route: string;
    durationMs: number;
    code?: string;
  }) => void;
  admitConnection?: (connection: string) => boolean;
}
async function jsonBody(request: Request, maxBytes = 16384): Promise<unknown> {
  if (
    request.headers.get('content-type')?.split(';')[0]?.trim() !==
    'application/json'
  )
    throw new ApiError(422, 'INVALID_INPUT', 'JSON body required');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(422, 'INVALID_INPUT', 'JSON body required');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Payload too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(422, 'INVALID_INPUT', 'Invalid JSON');
  }
}
export function createHandler(deps: ApiDependencies) {
  return async (
    request: Request,
    connection = 'unknown',
  ): Promise<Response> => {
    const started = performance.now();
    const requestId = crypto.randomUUID();
    const origin = request.headers.get('origin');
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Request-Id': requestId,
      Vary: 'Origin',
      'X-Content-Type-Options': 'nosniff',
    });
    const respond = (status: number, value?: unknown) => {
      deps.log?.({
        requestId,
        method: request.method,
        status,
        route: routeTemplate(new URL(request.url).pathname),
        durationMs: Math.round(performance.now() - started),
        ...(status >= 400
          ? { code: (value as { code?: string })?.code ?? 'UNAVAILABLE' }
          : {}),
      });
      return new Response(value === undefined ? null : JSON.stringify(value), {
        status,
        headers,
      });
    };
    try {
      if (origin && !deps.allowedOrigins.includes(origin))
        throw new ApiError(403, 'ORIGIN_DENIED', 'Origin not allowed');
      if (origin) headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Expose-Headers', 'X-Request-Id, Retry-After');
      if (request.method === 'OPTIONS') {
        headers.set(
          'Access-Control-Allow-Methods',
          'GET, POST, PATCH, DELETE, OPTIONS',
        );
        headers.set(
          'Access-Control-Allow-Headers',
          'authorization, apikey, content-type, idempotency-key',
        );
        return respond(204);
      }
      if (deps.admitConnection && !deps.admitConnection(connection))
        throw new ApiError(
          429,
          'RATE_LIMITED',
          'Connection burst limit exceeded',
        );
      const path = new URL(request.url).pathname;
      // Supabase gateway strips /functions/v1, local tests also accept full gateway paths.
      const relative = path.replace(/^\/functions\/v1/, '');
      const route = relative.match(/^\/api\/v1(\/.*)$/)?.[1];
      if (!route) throw new ApiError(404, 'NOT_FOUND', 'Route not found');
      if (route === '/health' && request.method === 'GET')
        return respond(200, { status: 'ok', version: 1 });
      const entityMatch = route.match(/^\/entities\/([^/]+)\/comments$/);
      const commentMatch = route.match(/^\/comments\/([^/]+)(\/moderate)?$/);
      const featureRoute = isFeatureRoute(route);
      const publicRead =
        (featureRoute && request.method === 'GET') ||
        ((!!entityMatch ||
          ['/state', '/entities/resolve', '/comments'].includes(route)) &&
          request.method === 'GET');
      if (
        !featureRoute &&
        !(entityMatch && ['GET', 'POST'].includes(request.method)) &&
        !(
          commentMatch &&
          (commentMatch[2]
            ? request.method === 'POST'
            : ['PATCH', 'DELETE'].includes(request.method))
        ) &&
        !(
          [
            '/me',
            '/admin/moderation',
            '/state',
            '/entities/resolve',
            '/comments',
          ].includes(route) && request.method === 'GET'
        )
      )
        throw new ApiError(404, 'NOT_FOUND', 'Route not found');
      const authorization = request.headers.get('authorization');
      if (authorization && !/^Bearer \S+$/i.test(authorization))
        throw new ApiError(401, 'UNAUTHENTICATED', 'Invalid session');
      const token = authorization?.slice(7);
      if (!publicRead && !token)
        throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in required');
      const backend = deps.backend(token);
      const user = token ? await backend.verifyUser() : null;
      if (featureRoute) {
        if (!backend.features)
          throw new ApiError(503, 'UNAVAILABLE', 'Feature API unavailable');
        return respond(
          200,
          await featureRequest(
            request,
            route,
            backend.features,
            user,
            jsonBody,
          ),
        );
      }
      if (route === '/state') return respond(200, await backend.commentState());
      if (route === '/entities/resolve') {
        const search = new URL(request.url).searchParams;
        if ([...search.keys()].some((k) => k !== 'path'))
          throw new ApiError(422, 'INVALID_INPUT', 'Unknown query parameter');
        const canonical = canonicalPageContext(
          search.get('path') ?? '',
          deps.siteBase ?? '/hiens-nha/',
        );
        if (!canonical)
          throw new ApiError(422, 'INVALID_INPUT', 'Invalid page context');
        const entity = await backend.resolveEntity(canonical);
        if (!entity)
          throw new ApiError(
            404,
            'NOT_FOUND',
            'Page is not registered for comments',
          );
        return respond(200, entity);
      }
      if (route === '/me')
        return respond(200, {
          id: user!.id,
          role: (await backend.isOwner()) ? 'owner' : 'member',
        });
      if (request.method === 'GET') {
        const url = new URL(request.url);
        if (
          [...url.searchParams.keys()].some(
            (k) =>
              ![
                'limit',
                'cursor',
                ...(entityMatch
                  ? ['parentId', 'view']
                  : route === '/comments'
                    ? ['view']
                    : []),
              ].includes(k),
          )
        )
          throw new ApiError(422, 'INVALID_INPUT', 'Unknown query parameter');
        const rawLimit = url.searchParams.get('limit') ?? '20';
        if (!/^\d+$/.test(rawLimit) || +rawLimit < 1 || +rawLimit > 50)
          throw new ApiError(422, 'INVALID_INPUT', 'Limit must be 1–50');
        const limit = +rawLimit;
        const cursor = decodeCursor(url.searchParams.get('cursor'));
        const entityId = entityMatch ? uuid(entityMatch[1]) : null;
        if (entityId && !(await backend.entityExists(entityId)))
          throw new ApiError(404, 'NOT_FOUND', 'Entity not found');
        if (route === '/admin/moderation' && !(await backend.isOwner()))
          throw new ApiError(403, 'FORBIDDEN', 'Owner required');
        const parentId =
          entityMatch && url.searchParams.has('parentId')
            ? uuid(url.searchParams.get('parentId'), 'parentId')
            : null;
        const view = url.searchParams.get('view');
        if (view && view !== 'mine')
          throw new ApiError(422, 'INVALID_INPUT', 'Invalid comment view');
        if (view === 'mine' && !user)
          throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in required');
        if (view === 'mine' && parentId)
          throw new ApiError(
            422,
            'INVALID_INPUT',
            'Choose a thread or own comments',
          );
        const rows =
          route === '/comments'
            ? await backend.listComments(
                null,
                cursor,
                limit + 1,
                null,
                view === 'mine' ? user!.id : undefined,
                true,
              )
            : view === 'mine'
              ? await backend.listComments(
                  entityId,
                  cursor,
                  limit + 1,
                  null,
                  user!.id,
                )
              : await backend.listComments(
                  entityId,
                  cursor,
                  limit + 1,
                  parentId,
                );
        const items = rows.slice(0, limit);
        return respond(200, {
          items,
          nextCursor:
            rows.length > limit ? encodeCursor(items[items.length - 1]!) : null,
        });
      }
      const input = await jsonBody(request);
      if (entityMatch) {
        const value = inputObject(input, ['body', 'parentId']);
        const item = await backend.rpc('create_comment', {
          p_entity_id: uuid(entityMatch[1]),
          p_body: bodyText(value.body),
          p_key: uuid(
            request.headers.get('idempotency-key'),
            'idempotency-key',
          ),
          p_parent_id:
            value.parentId == null ? null : uuid(value.parentId, 'parentId'),
        });
        return respond(200, item); // replay and first commit have identical contract
      }
      const id = uuid(commentMatch![1]);
      if (commentMatch![2]) {
        const value = inputObject(input, [
          'status',
          'expectedVersion',
          'reason',
        ]);
        if (
          !['approved', 'rejected', 'hidden'].includes(
            value.status as string,
          ) ||
          typeof value.reason !== 'string' ||
          !value.reason.replace(/[ \t\r\n\v\f]/g, '') ||
          Array.from(value.reason).length > 500
        )
          throw new ApiError(
            422,
            'INVALID_INPUT',
            'Status and moderation reason required',
          );
        return respond(
          200,
          await backend.rpc('moderate_comment', {
            p_id: id,
            p_status: value.status,
            p_reason: value.reason,
            p_expected_version: version(value.expectedVersion),
          }),
        );
      }
      const value = inputObject(
        input,
        request.method === 'PATCH'
          ? ['body', 'expectedVersion']
          : ['expectedVersion'],
      );
      return respond(
        200,
        await backend.rpc(
          request.method === 'PATCH' ? 'edit_comment' : 'delete_comment',
          {
            p_id: id,
            p_expected_version: version(value.expectedVersion),
            ...(request.method === 'PATCH'
              ? { p_body: bodyText(value.body) }
              : {}),
          },
        ),
      );
    } catch (error) {
      const known =
        error instanceof ApiError
          ? error
          : new ApiError(503, 'UNAVAILABLE', 'Service unavailable');
      if (known.status === 429) headers.set('Retry-After', '60');
      return respond(known.status, {
        code: known.code,
        message: known.message,
        requestId,
        fieldErrors: known.fieldErrors,
      });
    }
  };
}
