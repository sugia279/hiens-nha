import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { siteConfig } from '../../src/config/site';

describe('backend shells preserve static Pages and locale contracts', () => {
  for (const locale of ['', 'en/']) for (const path of ['account', 'account/callback', 'admin']) {
    it(`${locale}${path} has a static noindex shell and no legacy writer`, () => {
      const html = readFileSync(`dist/${locale}${path}/index.html`, 'utf8');
      expect(html).toContain('noindex'); expect(html).toContain(`lang="${locale ? 'en' : 'vi'}"`);
      expect(html).toContain(siteConfig.base); expect(html).not.toContain('page-comments-heading');
      expect(html).not.toContain('id="guestbook-form"');
      if (path !== 'account/callback') expect(html).toContain('data-backend-panel');
    });
  }
  it('existing guestbook still uses its current GitHub flow', () => {
    const html = readFileSync('dist/guestbook/index.html', 'utf8');
    expect(html).not.toContain('data-backend-panel'); expect(html).toContain('GitHub');
  });
});
