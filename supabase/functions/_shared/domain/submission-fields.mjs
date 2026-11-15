/** @param {unknown} value */
export function parseTags(value) {
  const tags = typeof value === 'string' ? value.split(',').map(tag => tag.trim()).filter(Boolean) : value;
  if (!Array.isArray(tags) || tags.length > 12 || tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 40)) return null;
  return [...new Set(tags.map(tag => tag.trim()))];
}
/** @param {string} title @param {string} marker @param {unknown} payload @param {string} repository */
export function submissionUrl(title, marker, payload, repository) {
  const url = new URL(`https://github.com/${repository}/issues/new`);
  url.searchParams.set('title', title);
  url.searchParams.set('body', `${marker}\n${JSON.stringify(payload, null, 2)}`);
  return url.href.length <= 7500 ? url.href : null;
}
