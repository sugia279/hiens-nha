import { expect, it } from 'vitest';
import { legacyCommentsFrozen } from '../../src/lib/legacy-comments.mjs';
import { acceptsLegacyComments } from '../../scripts/archive-guestbook.mjs';

it('freezes the legacy comment writer independently of the Git/API source', () => {
  const git = { version: 1, source: 'git', epoch: 0 };
  const api = { version: 1, source: 'api', epoch: 1 };
  expect(acceptsLegacyComments(git, { version: 1, frozen: false })).toBe(true);
  expect(acceptsLegacyComments(git, { version: 1, frozen: true })).toBe(false);
  for (const frozen of [true, false]) expect(acceptsLegacyComments(api, { version: 1, frozen })).toBe(false);
});

it('fails closed for missing, unsupported and nonboolean maintenance markers', () => {
  for (const config of [null, {}, { version: 2, frozen: false }, { version: 1, frozen: 'false' }]) {
    expect(() => legacyCommentsFrozen(config)).toThrow('maintenance marker');
    expect(() => acceptsLegacyComments({ version: 1, source: 'git', epoch: 0 }, config)).toThrow();
  }
  expect(() => acceptsLegacyComments({ version: 1, source: 'api', epoch: 0 }, { version: 1, frozen: true })).toThrow('source marker');
});
