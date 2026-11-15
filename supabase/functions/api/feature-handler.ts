import {
  ApiError,
  decodeCursor,
  encodeCursor,
  inputObject,
  uuid,
  version,
} from '../_shared/contracts.ts';
import { featurePayload, type FeatureName } from '../_shared/features.ts';
export interface FeatureBackend {
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
}
export function isFeatureRoute(route: string) {
  return (
    /^\/(posts|media|requests)(\/|$)/.test(route) ||
    /^\/features\/(posts|media|requests)\/state$/.test(route) ||
    ['/me/content', '/admin/publications', '/admin/requests'].includes(route)
  );
}
function text(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new ApiError(422, 'INVALID_INPUT', 'Required message/reason');
  return value.trim();
}
export async function featureRequest(
  request: Request,
  route: string,
  backend: FeatureBackend,
  user: { id: string } | null,
  parseBody: (r: Request, n?: number) => Promise<unknown>,
) {
  const search = new URL(request.url).searchParams;
  const state = route.match(/^\/features\/(posts|media|requests)\/state$/);
  if (state && request.method === 'GET')
    return backend.rpc('feature_state', { p_feature: state[1] });
  const legacy = route.match(/^\/requests\/legacy\/([1-9][0-9]*)$/);
  if (legacy && request.method === 'GET') {
    if (!Number.isSafeInteger(Number(legacy[1])))
      throw new ApiError(422, 'INVALID_INPUT', 'Invalid legacy number');
    return backend.rpc('request_legacy', { p_number: Number(legacy[1]) });
  }
  const match = route.match(
    /^\/(posts|media|requests)(?:\/([^/]+))?(?:\/(submit|moderate|unpublish|revisions|scope|transitions|events|corrections))?$/,
  );
  const admin = route === '/admin/publications' || route === '/admin/requests';
  const mine = route === '/me/content';
  const feature = (match?.[1] ??
    (route === '/admin/requests'
      ? 'requests'
      : search.get('feature'))) as FeatureName;
  if (
    !['posts', 'media', 'requests'].includes(feature) ||
    (!match && !admin && !mine)
  )
    throw new ApiError(404, 'NOT_FOUND', 'Route not found');
  const id = match?.[2] ? uuid(match[2]) : null,
    action = match?.[3];
  if (request.method === 'GET') {
    if (
      [...search.keys()].some(
        (k) =>
          !['view', 'limit', 'cursor', 'feature', 'before', 'status'].includes(
            k,
          ),
      )
    )
      throw new ApiError(422, 'INVALID_INPUT', 'Unknown query parameter');
    const raw = search.get('limit') ?? '20';
    if (!/^\d+$/.test(raw) || +raw < 1 || +raw > 50)
      throw new ApiError(422, 'INVALID_INPUT', 'Limit must be 1–50');
    const limit = +raw;
    if (action === 'revisions' || action === 'events') {
      if (
        !id ||
        (feature === 'requests' && action !== 'events') ||
        (feature !== 'requests' && action !== 'revisions')
      )
        throw new ApiError(404, 'NOT_FOUND', 'Route not found');
      if (feature !== 'requests' && !user)
        throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in required');
      const before = search.has('before')
        ? version(Number(search.get('before')))
        : null;
      const rows = (await backend.rpc(
        feature === 'requests' ? 'request_history' : 'publication_history',
        { p_id: id, p_before: before, p_limit: limit + 1 },
      )) as Array<{ revision?: number; version?: number }>;
      const items = rows.slice(0, limit);
      return {
        items,
        nextCursor:
          rows.length > limit
            ? String(
                feature === 'requests'
                  ? items.at(-1)!.version
                  : items.at(-1)!.revision,
              )
            : null,
      };
    }
    if (action) throw new ApiError(404, 'NOT_FOUND', 'Route not found');
    const view = admin
      ? feature === 'requests'
        ? 'all'
        : (search.get('view') ?? 'pending')
      : mine
        ? 'mine'
        : (search.get('view') ?? 'public');
    if (!['public', 'mine', 'working', 'pending', 'all'].includes(view))
      throw new ApiError(422, 'INVALID_INPUT', 'Invalid view');
    if (view !== 'public' && !user)
      throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in required');
    if (feature === 'requests' && !['public', 'mine', 'all'].includes(view))
      throw new ApiError(422, 'INVALID_INPUT', 'Invalid request view');
    const cursor = decodeCursor(search.get('cursor'));
    const data = await backend.rpc(
      feature === 'requests' ? 'request_read' : 'publication_read',
      {
        ...(feature === 'requests'
          ? { p_status: search.get('status') }
          : { p_feature: feature }),
        p_view: view,
        p_id: id,
        p_limit: limit + 1,
        p_after_time: cursor?.created_at ?? null,
        p_after_id: cursor?.id ?? null,
      },
    );
    if (id) return data;
    const rows = data as Array<{ id: string; created_at: string }>;
    const items = rows.slice(0, limit);
    return {
      items,
      nextCursor: rows.length > limit ? encodeCursor(items.at(-1)!) : null,
    };
  }
  if (!match || !user)
    throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in required');
  const key = uuid(request.headers.get('idempotency-key'), 'idempotency-key');
  const input = await parseBody(request, 65536);
  if (feature === 'requests') {
    if (!id && request.method === 'POST')
      return backend.rpc('request_write', {
        p_action: 'create',
        p_key: key,
        p_payload: featurePayload(feature, input),
      });
    if (!id) throw new ApiError(404, 'NOT_FOUND', 'Route not found');
    if (action === 'scope' && request.method === 'PATCH') {
      const value = inputObject(input, [
        'payload',
        'expectedVersion',
        'scopeRevision',
      ]);
      return backend.rpc('request_write', {
        p_action: 'scope',
        p_id: id,
        p_key: key,
        p_expected_version: version(value.expectedVersion),
        p_scope_revision: version(value.scopeRevision),
        p_payload: featurePayload(feature, value.payload),
      });
    }
    if (
      ['moderate', 'transitions', 'corrections'].includes(action ?? '') &&
      request.method === 'POST'
    ) {
      const value = inputObject(
        input,
        action === 'moderate'
          ? ['decision', 'reason', 'expectedVersion', 'scopeRevision']
          : action === 'corrections'
            ? ['eventId', 'message', 'expectedVersion', 'scopeRevision']
            : [
                'status',
                'message',
                'result',
                'expectedVersion',
                'scopeRevision',
              ],
      );
      return backend.rpc('request_write', {
        p_action:
          action === 'moderate'
            ? 'moderate'
            : action === 'transitions'
              ? 'transition'
              : 'correction',
        p_id: id,
        p_key: key,
        p_expected_version: version(value.expectedVersion),
        p_scope_revision: version(value.scopeRevision),
        p_status:
          action === 'moderate'
            ? text(value.decision, 20)
            : action === 'transitions'
              ? text(value.status, 30)
              : null,
        p_message: text(
          action === 'moderate' ? value.reason : value.message,
          action === 'moderate' ? 500 : 2000,
        ),
        p_result: typeof value.result === 'string' ? value.result : null,
        p_target: action === 'corrections' ? uuid(value.eventId) : null,
      });
    }
  } else {
    if (!id && request.method === 'POST')
      return backend.rpc('publication_write', {
        p_feature: feature,
        p_action: 'create',
        p_key: key,
        p_payload: featurePayload(feature, input),
      });
    if (!id) throw new ApiError(404, 'NOT_FOUND', 'Route not found');
    if (!action && request.method === 'PATCH') {
      const value = inputObject(input, ['payload', 'expectedVersion']);
      return backend.rpc('publication_write', {
        p_feature: feature,
        p_action: 'save',
        p_id: id,
        p_key: key,
        p_expected_version: version(value.expectedVersion),
        p_payload: featurePayload(feature, value.payload),
      });
    }
    if (!action && request.method === 'DELETE') {
      const value = inputObject(input, ['expectedVersion']);
      return backend.rpc('publication_write', {
        p_feature: feature,
        p_action: 'delete',
        p_id: id,
        p_key: key,
        p_expected_version: version(value.expectedVersion),
      });
    }
    if (
      ['submit', 'moderate', 'unpublish'].includes(action ?? '') &&
      request.method === 'POST'
    ) {
      const value = inputObject(
        input,
        action === 'moderate'
          ? ['decision', 'revision', 'expectedVersion', 'reason']
          : action === 'unpublish'
            ? ['expectedVersion', 'reason']
            : ['expectedVersion'],
      );
      if (
        action === 'moderate' &&
        !['approve', 'reject'].includes(String(value.decision))
      )
        throw new ApiError(422, 'INVALID_INPUT', 'Approve or reject required');
      return backend.rpc('publication_write', {
        p_feature: feature,
        p_action: action === 'moderate' ? value.decision : action,
        p_id: id,
        p_key: key,
        p_expected_version: version(value.expectedVersion),
        p_revision: action === 'moderate' ? version(value.revision) : null,
        p_reason: action === 'submit' ? null : text(value.reason, 500),
      });
    }
  }
  throw new ApiError(404, 'NOT_FOUND', 'Route not found');
}
