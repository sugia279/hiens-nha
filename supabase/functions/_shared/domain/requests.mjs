import { parseTags } from './submission-fields.mjs';
export const requestMarker = '<!-- hiens-nha:request:v1 -->';
export const updateMarker = '<!-- hiens-nha:request-update:v1 -->';
export const requestStatuses = ['new', 'accepted', 'in-progress', 'waiting', 'completed', 'declined', 'cancelled'];
export const transitions = {
  new: ['accepted', 'declined', 'cancelled'],
  accepted: ['in-progress', 'waiting', 'completed', 'cancelled'],
  'in-progress': ['waiting', 'completed', 'cancelled'],
  waiting: ['in-progress', 'completed', 'cancelled'],
  completed: ['in-progress'], declined: ['accepted'], cancelled: ['accepted'],
};
/** @param {unknown} value */
export function validateRequest(value) {
  if (!value || typeof value !== 'object') return null;
  const item = /** @type {Record<string, unknown>} */ (value);
  const text = (key, min, max) => typeof item[key] === 'string' && item[key].trim().length >= min && item[key].length <= max;
  const tags = parseTags(item.tags ?? []);
  if (!text('title', 3, 120) || !text('description', 10, 4000) || !text('expectedResult', 3, 1000) || !['technology', 'creative', 'information', 'other'].includes(String(item.category)) || !['low', 'normal', 'high'].includes(String(item.priority)) || !tags) return null;
  return { title: String(item.title).trim(), description: String(item.description).trim(), expectedResult: String(item.expectedResult).trim(), category: String(item.category), priority: String(item.priority), tags };
}
/** @param {unknown} body @param {string} marker */
function parseBody(body, marker) {
  if (typeof body !== 'string' || !body.startsWith(marker)) return null;
  try { return JSON.parse(body.slice(marker.length).trim()); } catch { return null; }
}
/** @param {unknown} body */
export function parseRequestBody(body) { return validateRequest(parseBody(body, requestMarker)); }
/** @param {unknown} body */
export function parseRequestUpdate(body) {
  const value = parseBody(body, updateMarker);
  if (!value || typeof value !== 'object' || !requestStatuses.includes(value.status) || typeof value.message !== 'string' || !value.message.trim() || value.message.length > 2000 || (value.result !== undefined && (typeof value.result !== 'string' || value.result.length > 4000))) return null;
  const result = (value.result ?? '').trim();
  if (value.status === 'completed' && !result) return null;
  return { status: String(value.status), message: value.message.trim(), result };
}
/** Rebuild from current comments so edits/deletions deterministically retract history.
 * Only the configured repository owner can author operational updates.
 */
export function createRequestArchive(issue, comments, owner, deleted = false, options = {}) {
  const request = deleted ? null : parseRequestBody(issue.body);
  const changedScope = request && options.previous?.request && JSON.stringify(request) !== JSON.stringify(validateRequest(options.previous.request));
  if (changedScope && !Number.isFinite(Date.parse(options.synchronizedAt))) throw new Error('Scope changes require a valid synchronization timestamp');
  const scopeChangedAt = changedScope ? options.synchronizedAt : options.previous?.scopeChangedAt;
  const timeline = [];
  const rejectedUpdates = [];
  let status = 'new'; let result = '';
  if (request) for (const comment of [...comments].sort((a,b) => a.id - b.id)) {
    if (comment.user?.login?.toLowerCase() !== owner.toLowerCase() || !String(comment.body ?? '').startsWith(updateMarker)) continue;
    if (scopeChangedAt && Date.parse(comment.created_at) <= Date.parse(scopeChangedAt)) continue;
    const update = parseRequestUpdate(comment.body);
    if (!update || (update.status !== status && !transitions[status].includes(update.status))) { rejectedUpdates.push(comment.id); continue; }
    status = update.status; result = status === 'completed' ? update.result : '';
    timeline.push({ id: comment.id, createdAt: comment.created_at, updatedAt: comment.updated_at, ...update });
  }
  return { version: 1, number: issue.number, approved: Boolean(request) && !deleted && issue.labels.some(label => (typeof label === 'string' ? label : label.name) === 'request-approved'), deleted, request, status, result, scopeChangedAt, timeline, rejectedUpdates, author: deleted ? '' : String(issue.user?.login ?? ''), createdAt: issue.created_at, updatedAt: issue.updated_at };
}
export const statusLabels = {
  vi: { new: 'Chờ tiếp nhận', accepted: 'Đã nhận', 'in-progress': 'Đang làm', waiting: 'Chờ bổ sung', completed: 'Hoàn thành', declined: 'Không nhận', cancelled: 'Đã hủy' },
  en: { new: 'Awaiting review', accepted: 'Accepted', 'in-progress': 'In progress', waiting: 'Waiting for information', completed: 'Completed', declined: 'Declined', cancelled: 'Cancelled' },
};
