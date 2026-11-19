import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const html = (path: string) => readFileSync(resolve('dist', path), 'utf8');

describe('navigation icons', () => {

  it('includes decorative icons on all first and second level items', () => {
    for (const prefix of ['', 'en/']) {
      const page = html(`${prefix}index.html`);
      for (const label of ['Home', 'Photos', 'Family', 'Scenery', 'Moments', 'Video', 'Favorite music', 'Favorite videos', 'Writing', 'Projects', 'Series', 'Novels', 'About', 'Introduction', 'Resume', 'Add album', 'Add video category', 'Add writing category']) expect(page).toContain(`data-nav-icon="${label.replaceAll('&', '&amp;')}"`);
      expect(page).toContain('aria-hidden="true"');
    }
  });
});
