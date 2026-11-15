import { parseTags } from './submission-fields.mjs';
export const mediaMarker = '<!-- hiens-nha:media:v1 -->';
/** @param {string} input */
export function normalizeMediaUrl(input) {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(host)) {
      const id = host === 'youtu.be' ? url.pathname.slice(1) : url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)\/?$/)?.[1];
      if (!id || !/^[\w-]{11}$/.test(id)) return null;
      return { platform: 'YouTube', url: `https://www.youtube.com/watch?v=${id}` };
    }
    if (host === 'fb.watch' && /^\/[\w-]+\/?$/.test(url.pathname)) return { platform: 'Facebook', url: `https://fb.watch${url.pathname}` };
    if (['facebook.com', 'www.facebook.com', 'm.facebook.com', 'mbasic.facebook.com'].includes(host)) {
      const id = url.searchParams.get('v');
      if (['/watch', '/watch/', '/video.php'].includes(url.pathname) && id && /^\d+$/.test(id)) return { platform: 'Facebook', url: `https://www.facebook.com/watch/?v=${id}` };
      // Verified public redirect for the owner's Perfect performance.
      const aliases = { '/share/v/1J6iFA7d3k/': '/sugia279/videos/10157418134484634/' };
      const videoPath = aliases[url.pathname.replace(/\/?$/, '/')] ?? url.pathname;
      if (/^\/(?:[\w.-]+\/videos\/\d+|reel\/\d+|share\/[vr]\/\w+)\/?$/.test(videoPath)) return { platform: 'Facebook', url: `https://www.facebook.com${videoPath}` };
    }
  } catch { /* Invalid links are never published. */ }
  return null;
}
/** @param {unknown} value */
export function validateMedia(value) {
  if (!value || typeof value !== 'object') return null;
  const item = /** @type {Record<string, unknown>} */ (value);
  if (typeof item.title !== 'string' || item.title.trim().length < 3 || item.title.length > 120 || typeof item.description !== 'string' || item.description.length > 1500 || !['music', 'video'].includes(String(item.category)) || typeof item.url !== 'string') return null;
  const tags = parseTags(item.tags ?? []);
  if (!tags) return null;
  const link = normalizeMediaUrl(item.url);
  return link ? { title: item.title.trim(), description: item.description.trim(), category: String(item.category), tags, ...link } : null;
}
/** @param {unknown} value */
export function parseMediaBody(value) {
  if (typeof value !== 'string' || !value.startsWith(mediaMarker)) return null;
  const json = value.slice(mediaMarker.length).trim();
  try { return validateMedia(JSON.parse(json)); } catch { return null; }
}

/** @param {string} input */
export function mediaEmbed(input) {
  const link = normalizeMediaUrl(input);
  if (!link) return null;
  if (link.platform === 'YouTube') return `https://www.youtube-nocookie.com/embed/${new URL(link.url).searchParams.get('v')}`;
  const url = new URL('https://www.facebook.com/plugins/video.php');
  url.searchParams.set('href', link.url);
  url.searchParams.set('show_text', 'true');
  url.searchParams.set('width', '560');
  return url.href;
}
