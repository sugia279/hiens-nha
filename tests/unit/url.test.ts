import { siteConfig } from '../../src/config/site';
const BASE = siteConfig.base;
import { describe, it, expect } from 'vitest';
import { buildUrl, canonicalUrl, entryUrl, topicUrl, paginatedUrl, getBase, getOrigin } from '../../src/utils/url';

describe('url utility', () => {
  describe('buildUrl', () => {
    it('prepends the configured base', () => {
      expect(buildUrl('articles')).toBe(`${BASE}articles`);
    });

    it('handles trailing slashes', () => {
      expect(buildUrl('articles', '/')).toBe(`${BASE}articles/`);
    });

    it('normalizes duplicate slashes', () => {
      expect(buildUrl('//articles//')).toBe(`${BASE}articles/`);
    });

    it('handles nested segments', () => {
      expect(buildUrl('notes', 'astro/base-paths', '/')).toBe(
        `${BASE}notes/astro/base-paths/`,
      );
    });

    it('rejects path traversal', () => {
      expect(() => buildUrl('../etc/passwd')).toThrow('traversal');
    });

    it('handles empty string to produce base', () => {
      expect(buildUrl('')).toBe(`${BASE}`);
    });

    it('handles root slash', () => {
      expect(buildUrl('/')).toBe(`${BASE}`);
    });
  });

  describe('canonicalUrl', () => {
    it('produces absolute URL with origin', () => {
      expect(canonicalUrl('articles/my-post/')).toBe(
        `${siteConfig.origin}${BASE}articles/my-post/`,
      );
    });

    it('produces home canonical', () => {
      expect(canonicalUrl('/')).toBe(
        `${siteConfig.origin}${BASE}`,
      );
    });
  });

  describe('entryUrl', () => {
    it('builds collection entry URL', () => {
      expect(entryUrl('articles', 'my-post')).toBe(
        `${BASE}articles/my-post/`,
      );
    });

    it('handles nested slugs', () => {
      expect(entryUrl('notes', 'astro/base-paths')).toBe(
        `${BASE}notes/astro/base-paths/`,
      );
    });
  });

  describe('topicUrl', () => {
    it('builds topic URL', () => {
      expect(topicUrl('typescript')).toBe(`${BASE}topics/typescript/`);
    });
  });

  describe('paginatedUrl', () => {
    it('returns base for page 1', () => {
      expect(paginatedUrl('articles/', 1)).toBe(`${BASE}articles/`);
    });

    it('appends page segment for page 2+', () => {
      expect(paginatedUrl('articles/', 3)).toBe(
        `${BASE}articles/page/3/`,
      );
    });
  });

  describe('getBase and getOrigin', () => {
    it('returns configured base', () => {
      expect(getBase()).toBe(`${BASE}`);
    });

    it('returns configured origin', () => {
      expect(getOrigin()).toBe(siteConfig.origin);
    });
  });
});
