import { it, expect } from 'vitest';
import { publicationAnchors } from '../../src/lib/legacy-publication-aliases.server';
import { stableId } from '../../scripts/migration/comments-model.mjs';
it('keeps the hand-authored zero-number bookmark on the importer UUID and excludes pending/deleted aliases', () => {
  const aliases = publicationAnchors({
    '../../data/knowledge/tho-ngau-hung.json': {
      version: 1,
      number: 0,
      approved: true,
      deleted: false,
    },
    'pending.json': { version: 1, number: 2, approved: false, deleted: false },
    'deleted.json': { version: 1, number: 3, approved: true, deleted: true },
  });
  expect(aliases).toEqual({
    [stableId('legacy:posts:tho-ngau-hung.json')]: 'shared-post-0',
  });
});
