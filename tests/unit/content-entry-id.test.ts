import { it, expect } from 'vitest';
import { legacyContentId } from '../../src/lib/content/entry-id';

it('preserves extension, Unicode, spaces, case and folder identity across Content Layer migration', () => {
  const path = 'Nhà có tiên thê/0001--Chương 1--resource_abc.mdx';
  expect(legacyContentId({ entry: path })).toBe(path);
  expect(legacyContentId({ entry: 'notes\\Overview.md' })).toBe('notes/Overview.md');
});
