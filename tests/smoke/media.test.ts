import { sourceFor, assertApiSource } from './source-contract';
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
it('offers favorite categories and moderated submission in both languages', () => {
  for (const prefix of ['', 'en/']) {
    const page = readFileSync(`dist/${prefix}music/index.html`, 'utf8');
    expect(page).toContain('data-nav-branch="/music/"');
    expect(page).toContain('https://www.youtube-nocookie.com/embed/l5WuCFObGGQ');
    if (sourceFor('media').source === 'api') assertApiSource(page, 'media');
    else {
      for (const id of ['favorite-music', 'favorite-videos', 'share-link', 'media-form', 'media-url', 'media-description']) expect(page).toContain(`id="${id}"`);
      expect(page).toContain(prefix ? 'A GitHub account is required' : 'Cần tài khoản GitHub');
    }
  }
});
