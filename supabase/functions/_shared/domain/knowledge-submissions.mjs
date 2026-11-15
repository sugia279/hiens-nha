import { parseTags } from './submission-fields.mjs';
export const knowledgeMarker = '<!-- hiens-nha:knowledge:v1 -->';
/** @param {unknown} value */
export function validateKnowledge(value) {
  if (!value || typeof value !== 'object') return null;
  const item = /** @type {Record<string, unknown>} */ (value);
  const text = (key, min, max) => typeof item[key] === 'string' && item[key].trim().length >= min && item[key].length <= max;
  if (!text('title', 3, 120) || !text('body', 1, 12000) || !text('category', 1, 60) || !['article', 'note', 'poem'].includes(String(item.kind))) return null;
  const tags = parseTags(item.tags);
  if (!tags || !tags.length || !text('series', 0, 100) || !Number.isSafeInteger(item.order) || Number(item.order) < 1 || Number(item.order) > 100000) return null;
  return { title: String(item.title).trim(), body: String(item.body).trim(), kind: String(item.kind), category: String(item.category).trim(), tags, series: String(item.series).trim(), order: Number(item.order) };
}
/** @param {unknown} value */
export function parseKnowledgeBody(value) {
  if (typeof value !== 'string' || !value.startsWith(knowledgeMarker)) return null;
  try { return validateKnowledge(JSON.parse(value.slice(knowledgeMarker.length).trim())); } catch { return null; }
}
