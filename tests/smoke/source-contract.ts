import { expect } from 'vitest';
import comments from '../../config/comments-source.json';
import features from '../../config/feature-sources.json';
import { validateSource } from '../../supabase/functions/_shared/source-mode.mjs';
import maintenance from '../../config/legacy-comments.json';
import { legacyCommentsFrozen } from '../../src/lib/legacy-comments.mjs';
export const commentsFrozen = legacyCommentsFrozen(maintenance);
export function assertFrozenComments(page: string) {
  expect(page).toContain('data-legacy-comments-frozen');
  expect(page).not.toContain('id="guestbook-form"');
  expect(page).not.toContain('template=guestbook.md');
  expect(page).not.toContain('Reply on GitHub');
  expect(page).not.toContain('Trả lời trên GitHub');
}
export type Feature = 'comments' | 'posts' | 'media' | 'requests';
export function sourceFor(feature: Feature) {
  expect(comments.version).toBe(1); expect(features.version).toBe(1);
  return validateSource(feature === 'comments' ? comments : features[feature]);
}
/** Check the expected source from versioned config, never infer it from missing UI. */
export function assertApiSource(page: string, feature: Feature) {
  const source = sourceFor(feature); expect(source.source).toBe('api');
  const marker = feature === 'comments' ? 'data-api-comments' : feature === 'requests' ? 'data-api-requests' : 'data-publications';
  const sections = [...page.matchAll(/<section\b[^>]*>/g)].map(m => m[0]);
  const panel = sections.find(tag => new RegExp(`\\s${marker}(?:\\s|=|>)`).test(tag) &&
    (feature === 'posts' || feature === 'media' ? tag.includes(`data-feature="${feature}"`) : true));
  expect(panel, `${feature} API panel required`).toBeDefined();
  expect(panel).toContain(`data-epoch="${source.epoch}"`);
  expect(page).toMatch(/<html\b[^>]*data-backend-enabled="true"/);
  const legacy = { comments: 'guestbook', posts: 'knowledge', media: 'media', requests: 'request' }[feature];
  expect(page).not.toContain(`id="${legacy}-form"`);
  if (feature === 'posts' || feature === 'media') expect(page).toMatch(/href="[^"<>]*account\/content\/"/);
  else expect(page).toContain('data-sign-in');
}
