import { it, expect } from 'vitest';
import { selectLoadProfile } from '../../scripts/backend/load-profile.mjs';
it('requires full-duration measurements for backend/load/dependency changes and fails closed on unknown diffs', () => {
  expect(
    selectLoadProfile([
      'supabase/functions/api/handler.ts',
      'docs/project/backend-progress.md',
    ]),
  ).toBe('full');
  expect(selectLoadProfile(['tests/load/local.mjs'])).toBe('full');
  expect(selectLoadProfile(['package-lock.json'])).toBe('full');
  expect(selectLoadProfile([])).toBe('full');
  expect(selectLoadProfile(['docs/project/backend-progress.md'])).toBe('ci');
  expect(selectLoadProfile(['src/components/content/publications.ts'])).toBe(
    'ci',
  );
});
