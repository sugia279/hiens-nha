import { siteConfig } from '../../src/config/site';
const BASE = siteConfig.base;
import { describe, it, expect } from 'vitest';
import { buildSEOData, serializeStructuredData, buildBreadcrumbStructuredData } from '../../src/utils/seo';

describe('seo utility', () => {
  describe('buildSEOData', () => {
    it('builds home page SEO', () => {
      const seo = buildSEOData({
        title: "Hiên Nhà",
        description: 'Knowledge garden',
        path: '/',
        kind: 'home',
      });
      expect(seo.canonical).toBe(`https://sugia279.github.io${BASE}`);
      expect(seo.title).toContain("Hiên Nhà");
      expect(seo.openGraph.type).toBe('website');
      expect(seo.robots).toBeUndefined();
    });

    it('builds article SEO with dates', () => {
      const seo = buildSEOData({
        title: 'My Article',
        description: 'A great article',
        path: 'articles/my-article/',
        kind: 'article',
        publishedAt: new Date('2026-01-15'),
        updatedAt: new Date('2026-03-01'),
        tags: ['typescript', 'testing'],
      });
      expect(seo.canonical).toContain('/articles/my-article/');
      expect(seo.title).toBe("My Article | Hiên Nhà");
      expect(seo.openGraph.type).toBe('article');
      expect(seo.openGraph.publishedTime).toContain('2026-01-15');
      expect(seo.openGraph.tags).toEqual(['typescript', 'testing']);
      expect(seo.structuredData?.['@type']).toBe('Article');
    });

    it('builds project SEO', () => {
      const seo = buildSEOData({
        title: 'My Project',
        description: 'A project',
        path: 'projects/my-project/',
        kind: 'project',
      });
      expect(seo.structuredData?.['@type']).toBe('CreativeWork');
    });

    it('sets noindex robots when requested', () => {
      const seo = buildSEOData({
        title: 'Search',
        description: 'Search page',
        path: 'search/',
        kind: 'search',
        noIndex: true,
      });
      expect(seo.robots).toBe('noindex, nofollow');
      expect(seo.structuredData).toBeUndefined();
    });

    it('uses summary_large_image card when image provided', () => {
      const seo = buildSEOData({
        title: 'Post',
        description: 'Desc',
        path: 'articles/post/',
        kind: 'article',
        image: '/images/cover.jpg',
      });
      expect(seo.twitter.card).toBe('summary_large_image');
    });
  });

  describe('serializeStructuredData', () => {
    it('wraps with @context', () => {
      const result = serializeStructuredData({ '@type': 'WebPage', name: 'Test' });
      const parsed = JSON.parse(result.replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\u0026/g, '&'));
      expect(parsed['@context']).toBe('https://schema.org');
      expect(parsed['@type']).toBe('WebPage');
    });

    it('escapes HTML-unsafe characters', () => {
      const result = serializeStructuredData({
        '@type': 'Article',
        name: '<script>alert("xss")</script>',
      });
      expect(result).not.toContain('<script>');
      expect(result).toContain('\\u003c');
    });
  });

  describe('buildBreadcrumbStructuredData', () => {
    it('builds breadcrumb list', () => {
      const data = buildBreadcrumbStructuredData([
        { label: 'Home', href: '/' },
        { label: 'Articles', href: '/articles/' },
        { label: 'My Post', current: true },
      ]);
      expect(data['@type']).toBe('BreadcrumbList');
      const items = data['itemListElement'] as Array<{ position: number; name: string }>;
      expect(items).toHaveLength(3);
      expect(items[0]!.position).toBe(1);
      expect(items[2]!.name).toBe('My Post');
    });
  });
});
