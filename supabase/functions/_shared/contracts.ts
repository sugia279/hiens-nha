/** Portable DTOs: browser, Node tests and Deno import this exact module. */
export interface Comment {
  id: string; entity_id: string; author_id: string | null; parent_id: string | null;
  context_path?: string; legacy_author_login?: string | null; legacy_url?: string | null;
  body: string; status: 'pending' | 'approved' | 'rejected' | 'hidden'; version: number;
  created_at: string; updated_at: string; deleted_at: string | null;
}
export interface CommentState { source: 'git' | 'api'; epoch: number; writes_enabled: boolean }
export interface ContentEntity { id: string; canonical_path: string }
export interface CommentPage { items: Comment[]; nextCursor: string | null }
export interface Cursor { created_at: string; id: string }
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fieldErrors: Record<string, string> = {}) { super(message); }
}
export function uuid(value: unknown, field = 'id'): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
    throw new ApiError(422, 'INVALID_INPUT', 'Invalid UUID', { [field]: 'UUID required' });
  return value;
}
export function inputObject(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !fields.includes(k)))
    throw new ApiError(422, 'INVALID_INPUT', 'Unexpected input fields');
  return value as Record<string, unknown>;
}
export function bodyText(value: unknown): string {
  if (typeof value !== 'string' || !value.replace(/[ \t\r\n\v\f]/g, '') || Array.from(value).length > 4000)
    throw new ApiError(422, 'INVALID_INPUT', 'Body must contain 1–4000 characters', { body: '1–4000 characters required' });
  return value;
}
export function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 2147483647)
    throw new ApiError(422, 'INVALID_INPUT', 'Expected version required');
  return value as number;
}
export function encodeCursor(item: Cursor): string {
  return btoa(JSON.stringify({ created_at: item.created_at, id: item.id })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeCursor(value: string | null): Cursor | null {
  if (!value) return null;
  try {
    if (value.length > 256 || !/^[\w-]+$/.test(value)) throw new Error();
    const parsed = inputObject(JSON.parse(atob(value.replace(/-/g, '+').replace(/_/g, '/'))), ['created_at', 'id']);
    // Preserve PostgreSQL microseconds. Strict syntax prevents PostgREST filter injection.
    if (typeof parsed.created_at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(parsed.created_at) || !Number.isFinite(Date.parse(parsed.created_at))) throw new Error();
    return { created_at: parsed.created_at, id: uuid(parsed.id) };
  } catch { throw new ApiError(422, 'INVALID_INPUT', 'Invalid cursor'); }
}

/** Configuration guard only; session JWTs are always verified by Auth, never decoded for trust. */
export function publicKey(value: unknown): string {
  const key = typeof value === 'string' ? value : '';
  if (key.startsWith('sb_publishable_') && key.length > 15) return key;
  try {
    const parts = key.split('.');
    if (parts.length === 3 && JSON.parse(atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon') return key;
  } catch { /* invalid configuration */ }
  throw new Error('A public publishable/anon key is required');
}
