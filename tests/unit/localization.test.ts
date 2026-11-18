import { describe, expect, it } from 'vitest';
import { localizeHtml } from '../../src/lib/localize-html';
import { localeFromPath, localeUrl } from '../../src/lib/i18n';
import { siteConfig } from '../../src/config/site';
const base = siteConfig.base;

describe('bilingual static HTML', () => {
  const source = `<html lang="en"><head><title>Articles | Hiên Nhà</title></head><body>
    <a href="${base}articles/">Articles</a><a href="${base}en/articles/" data-locale-link>EN</a>
    <a href="${base}resume/profile.html">Resume</a><a href="https://external.example/">External</a>
    <div data-original-content><p>Articles</p><p>&lt;script&gt;alert(1)&lt;/script&gt;</p></div>
    <script>const text = 'Articles';</script></body></html>`;
  it('defaults to Vietnamese, translates UI and preserves authored text and scripts', () => {
    const result = localizeHtml(source, 'vi');
    expect(result).toContain('lang="vi"');
    expect(result).toContain('Bài viết | Hiên Nhà');
    expect(result).toContain('<p>Articles</p>');
    expect(result).toContain("const text = 'Articles'");
    expect(result).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(result).toContain(`href="${base}en/articles/" data-locale-link`);
  });
  it('localizes internal navigation and leaves shared assets and external links alone', () => {
    const result = localizeHtml(source, 'en');
    expect(result).toContain(`href="${base}en/articles/"`);
    expect(result).toContain(`href="${base}resume/profile.html"`);
    expect(result).toContain('href="https://external.example/"');
    expect(result).not.toContain('/en/en/');
  });
  it('switches to the same logical page and keeps query strings', () => {
    expect(localeUrl(`${base}en/articles/?q=piano`, 'vi')).toBe(`${base}articles/?q=piano`);
    expect(localeUrl(`${base}en/articles/`, 'en')).toBe(`${base}en/articles/`);
    expect(localeFromPath(`${base}en/music/`)).toBe('en');
    expect(localeFromPath(`${base}music/`)).toBe('vi');
  });
});
