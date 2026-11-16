import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, type Comment, type Cursor, type ContentEntity, type CommentState } from '../_shared/contracts.ts';
import type { CallerBackend } from './handler.ts';

export function dbError(error: { code?: string; message?: string } | null): void {
  if (!error) return;
  if (error.code === 'PT503' && error.message === 'Read admission unavailable') throw new ApiError(503, 'UNAVAILABLE', 'Read service unavailable');
  const codes: Record<string, [number, string, string]> = {
    PT401: [401, 'UNAUTHENTICATED', 'Sign in required'], PT403: [403, 'FORBIDDEN', 'Action not permitted'],
    '42501': [403, 'FORBIDDEN', 'Action not permitted'], PT404: [404, 'NOT_FOUND', 'Content not found'],
    PT409: [409, 'CONFLICT', 'Content changed or idempotency key reused; refresh before retrying'],
    PT422: [422, 'INVALID_INPUT', 'Invalid input'], PT429: [429, 'RATE_LIMITED', 'Request budget exceeded; retry later'],
    PT503: [503, 'WRITES_DISABLED', 'Feature writes are disabled'],
  };
  const [status, code, message] = codes[error.code ?? ''] ?? [503, 'UNAVAILABLE', 'Service unavailable'];
  throw new ApiError(status, code, message);
}
export function callerBackend(client: SupabaseClient): CallerBackend {
  return {
    features:{ async rpc(name,args){const {data,error}=await client.rpc(name,args);dbError(error);return data;} },
    async commentState() {
      const { data, error } = await client.rpc('comment_state').single(); dbError(error); return data as CommentState;
    },
    async resolveEntity(path: string) {
      const { data, error } = await client.rpc('resolve_entity', { p_path: path });
      dbError(error); return data as ContentEntity | null;
    },
    async verifyUser() {
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) throw new ApiError(401, 'UNAUTHENTICATED', 'Invalid or expired session');
      return { id: data.user.id };
    },
    async isOwner() {
      const { data, error } = await client.rpc('caller_is_owner');
      dbError(error); return !!data;
    },
    async entityExists(id) {
      const { data, error } = await client.rpc('resolve_entity', { p_id: id });
      dbError(error); return !!data;
    },
    async listComments(entityId: string | null, cursor: Cursor | null, limit: number, parentId: string | null = null, authorId?: string, feed = false) {
      const { data, error } = await client.rpc('read_comments', {
        p_entity_id: entityId, p_after_time: cursor?.created_at ?? null,
        p_after_id: cursor?.id ?? null, p_limit: limit, p_parent_id: parentId,
        p_mine: !!authorId, p_feed: feed,
      });
      dbError(error); return (data ?? []) as Comment[];
    },
    async rpc(name, args) { const { data, error } = await client.rpc(name, args).single(); dbError(error);
      const row = data as Partial<Comment> | null;
      if (!row || typeof row.id !== 'string' || !Number.isInteger(row.version)) throw new ApiError(503, 'UNAVAILABLE', 'Invalid committed response');
      return row as Comment; },
  };
}
