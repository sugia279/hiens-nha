import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const photoRecords = readdirSync('src/data/photos').filter(name => name.endsWith('.json')).map(name => JSON.parse(readFileSync(resolve('src/data/photos', name), 'utf8')));
const featuredCount = Math.min(4, photoRecords.filter(photo => photo.featuredOrder).length);
const html = (path: string) => readFileSync(resolve('dist', path), 'utf8');

describe('home photographs', () => {
  it('places the featured cover above the owner avatar and introduction in both languages', () => {
    for (const prefix of ['', 'en/']) {
      const page = html(`${prefix}index.html`);
      const gallery = page.match(/<div class="home-photos"[\s\S]*?<\/div>/)?.[0] ?? '';
      expect(gallery.match(/<img /g)).toHaveLength(featuredCount);
      expect(gallery).toContain(`data-photo-count="${featuredCount}"`);
      for (const name of ['hien-at-cafe', 'hien-and-wife', 'hien-family', 'Bill-va-Boi']) expect(gallery).toContain(name);
      expect(gallery).toContain('srcset=');
      expect(gallery).toContain('.webp');
      const avatar = page.indexOf('class="home-avatar"');
      expect(avatar).toBeGreaterThan(page.indexOf('class="home-photos"'));
      expect(avatar).toBeLessThan(page.indexOf('class="house-lead"'));
      expect(page).toContain('/hiens-nha/resume/SuDuyHien_Profile.png');
      expect(page).toContain('data-cover-search');
      expect(page).toContain(`action="/hiens-nha/${prefix}search/"`);
      expect(page.match(/name="q"/g)).toHaveLength(1);
      expect(page).not.toContain('id="topbar-search-input"');
    }
  });
  it('keeps the existing topbar search on interior pages', () => {
    for (const prefix of ['', 'en/']) expect(html(`${prefix}photos/index.html`)).toContain('id="topbar-search-input"');
  });
});
