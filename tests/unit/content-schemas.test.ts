/**
 * Schema tests for all four content collections.
 * Parses frontmatter objects directly against Zod schemas — no Astro runtime needed.
 * Covers: valid shapes, collection-specific fields, refine rules, and invalid rejection cases.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared schema fragments (mirrors content.config.ts)
// ---------------------------------------------------------------------------

const domainEnum = z.enum([
  'engineering',
  'artificial-intelligence',
  'music',
  'reading-literature',
  'philosophy-life',
]);

const connectionTypeEnum = z.enum([
  'prerequisite',
  'explains',
  'extends',
  'contrasts',
  'applies-to',
  'derived-from',
  'related',
]);

const contentConnectionSchema = z.object({
  type: connectionTypeEnum,
  target: z.object({
    collection: z.enum(['articles', 'notes', 'projects', 'series']),
    id: z.string().min(1),
  }),
  context: z.string().optional(),
});

const sharedSchema = z.object({
  title: z.string().min(1).transform((s) => s.trim()),
  description: z.string().min(1).transform((s) => s.trim()),
  publishedAt: z.coerce.date(),
  updatedAt: z.coerce.date().optional(),
  draft: z.boolean().optional().default(false),
  tags: z.array(z.string().min(1)).min(1),
  domains: z.array(domainEnum).min(1),
  connections: z.array(contentConnectionSchema).optional().default([]),
  image: z.object({ src: z.string().min(1), alt: z.string(), caption: z.string().optional() }).optional(),
  canonicalUrl: z.url().optional(),
});

const articleSchema = sharedSchema.extend({
  featured: z.boolean().optional().default(false),
  showTableOfContents: z.boolean().optional().default(true),
  series: z.string().optional(),
  seriesOrder: z.number().int().positive().optional(),
}).refine(
  (d) => (d.series !== undefined) === (d.seriesOrder !== undefined),
  { message: 'series and seriesOrder must both be present or both be absent' },
);

const noteSchema = sharedSchema.extend({
  maturity: z.enum(['seed', 'growing', 'evergreen']),
});

const projectSchema = sharedSchema.extend({
  status: z.enum(['active', 'maintained', 'completed', 'archived']),
  role: z.string().min(1).transform((s) => s.trim()),
  skills: z.array(z.string().min(1)).min(1),
  tools: z.array(z.string().min(1)).optional().default([]),
  period: z.object({
    start: z.string().regex(/^\d{4}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  }),
  repositoryUrl: z.url().optional(),
  liveUrl: z.url().optional(),
  featured: z.boolean().optional().default(false),
}).refine(
  (d) => !d.period.end || d.period.end >= d.period.start,
  { message: 'period.end must not be before period.start' },
);

const seriesSchema = sharedSchema.extend({
  entries: z.array(z.object({
    collection: z.enum(['articles', 'notes']),
    id: z.string().min(1),
  })).min(1),
});

// ---------------------------------------------------------------------------
// Shared valid base
// ---------------------------------------------------------------------------

const validBase = {
  title: 'Test Entry',
  description: 'A description.',
  publishedAt: '2026-01-01',
  tags: ['astro'],
  domains: ['engineering' as const],
};

// ---------------------------------------------------------------------------
// Article tests
// ---------------------------------------------------------------------------

describe('article schema', () => {
  it('accepts a minimal valid article', () => {
    const result = articleSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.featured).toBe(false);
      expect(result.data.showTableOfContents).toBe(true);
      expect(result.data.draft).toBe(false);
      expect(result.data.connections).toEqual([]);
    }
  });

  it('accepts a featured article with TOC disabled', () => {
    const result = articleSchema.safeParse({
      ...validBase,
      featured: true,
      showTableOfContents: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a series-member article', () => {
    const result = articleSchema.safeParse({
      ...validBase,
      series: 'my-series',
      seriesOrder: 1,
    });
    expect(result.success).toBe(true);
  });

  it('rejects series without seriesOrder', () => {
    const result = articleSchema.safeParse({ ...validBase, series: 'my-series' });
    expect(result.success).toBe(false);
  });

  it('rejects seriesOrder without series', () => {
    const result = articleSchema.safeParse({ ...validBase, seriesOrder: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects empty title', () => {
    const result = articleSchema.safeParse({ ...validBase, title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty tags array', () => {
    const result = articleSchema.safeParse({ ...validBase, tags: [] });
    expect(result.success).toBe(false);
  });

  it('rejects empty domains array', () => {
    const result = articleSchema.safeParse({ ...validBase, domains: [] });
    expect(result.success).toBe(false);
  });

  it('rejects invalid domain', () => {
    const result = articleSchema.safeParse({ ...validBase, domains: ['unknown-domain'] });
    expect(result.success).toBe(false);
  });

  it('accepts a valid connection', () => {
    const result = articleSchema.safeParse({
      ...validBase,
      connections: [{ type: 'explains', target: { collection: 'notes', id: 'my-note' } }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid connection type', () => {
    const result = articleSchema.safeParse({
      ...validBase,
      connections: [{ type: 'references', target: { collection: 'notes', id: 'my-note' } }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts all seven connection types', () => {
    const types = ['prerequisite', 'explains', 'extends', 'contrasts', 'applies-to', 'derived-from', 'related'] as const;
    for (const type of types) {
      const result = articleSchema.safeParse({
        ...validBase,
        connections: [{ type, target: { collection: 'notes', id: 'n' } }],
      });
      expect(result.success, `Expected ${type} to be valid`).toBe(true);
    }
  });

  it('accepts draft article', () => {
    const result = articleSchema.safeParse({ ...validBase, draft: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.draft).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Note tests
// ---------------------------------------------------------------------------

describe('note schema', () => {
  const validNote = { ...validBase, maturity: 'growing' as const };

  it('accepts all maturity values', () => {
    for (const m of ['seed', 'growing', 'evergreen'] as const) {
      expect(noteSchema.safeParse({ ...validBase, maturity: m }).success).toBe(true);
    }
  });

  it('rejects invalid maturity', () => {
    const result = noteSchema.safeParse({ ...validBase, maturity: 'published' });
    expect(result.success).toBe(false);
  });

  it('rejects missing maturity', () => {
    const result = noteSchema.safeParse(validBase);
    expect(result.success).toBe(false);
  });

  it('accepts updatedAt on or after publishedAt', () => {
    const result = noteSchema.safeParse({
      ...validNote,
      publishedAt: '2026-01-01',
      updatedAt: '2026-06-01',
    });
    expect(result.success).toBe(true);
  });

  it('accepts all five domains', () => {
    const domains = ['engineering', 'artificial-intelligence', 'music', 'reading-literature', 'philosophy-life'] as const;
    for (const d of domains) {
      expect(noteSchema.safeParse({ ...validNote, domains: [d] }).success).toBe(true);
    }
  });

  it('accepts multiple domains', () => {
    const result = noteSchema.safeParse({
      ...validNote,
      domains: ['engineering', 'artificial-intelligence'],
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Project tests
// ---------------------------------------------------------------------------

describe('project schema', () => {
  const validProject = {
    ...validBase,
    status: 'active' as const,
    role: 'Senior Engineer',
    skills: ['Testing'],
    period: { start: '2025-06' },
  };

  it('accepts a minimal valid project', () => {
    const result = projectSchema.safeParse(validProject);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tools).toEqual([]);
      expect(result.data.featured).toBe(false);
    }
  });

  it('accepts all project statuses', () => {
    for (const status of ['active', 'maintained', 'completed', 'archived'] as const) {
      expect(projectSchema.safeParse({ ...validProject, status }).success).toBe(true);
    }
  });

  it('accepts full project with optional fields', () => {
    const result = projectSchema.safeParse({
      ...validProject,
      tools: ['C#', '.NET'],
      period: { start: '2022-01', end: '2025-06' },
      repositoryUrl: 'https://github.com/sugia279/repo',
      liveUrl: 'https://example.com',
      featured: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects end before start', () => {
    const result = projectSchema.safeParse({
      ...validProject,
      period: { start: '2025-06', end: '2024-01' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty skills', () => {
    const result = projectSchema.safeParse({ ...validProject, skills: [] });
    expect(result.success).toBe(false);
  });

  it('rejects invalid status', () => {
    const result = projectSchema.safeParse({ ...validProject, status: 'deleted' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid period format', () => {
    const result = projectSchema.safeParse({
      ...validProject,
      period: { start: '2025/06' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-https repositoryUrl', () => {
    const result = projectSchema.safeParse({
      ...validProject,
      repositoryUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Series tests
// ---------------------------------------------------------------------------

describe('series schema', () => {
  const validSeries = {
    ...validBase,
    entries: [
      { collection: 'articles' as const, id: 'my-article' },
      { collection: 'notes' as const, id: 'my-note' },
    ],
  };

  it('accepts a valid series with mixed entries', () => {
    const result = seriesSchema.safeParse(validSeries);
    expect(result.success).toBe(true);
  });

  it('rejects empty entries array', () => {
    const result = seriesSchema.safeParse({ ...validBase, entries: [] });
    expect(result.success).toBe(false);
  });

  it('rejects project as entry collection', () => {
    const result = seriesSchema.safeParse({
      ...validBase,
      entries: [{ collection: 'projects', id: 'some-project' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects series as entry collection', () => {
    const result = seriesSchema.safeParse({
      ...validBase,
      entries: [{ collection: 'series', id: 'nested-series' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts articles-only entries', () => {
    const result = seriesSchema.safeParse({
      ...validBase,
      entries: [{ collection: 'articles', id: 'a1' }, { collection: 'articles', id: 'a2' }],
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Shared schema tests
// ---------------------------------------------------------------------------

describe('shared schema', () => {
  it('trims whitespace from title', () => {
    const result = articleSchema.safeParse({ ...validBase, title: '  Padded Title  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBe('Padded Title');
  });

  it('coerces date string to Date object', () => {
    const result = articleSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.publishedAt).toBeInstanceOf(Date);
  });

  it('defaults draft to false', () => {
    const result = articleSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.draft).toBe(false);
  });

  it('defaults connections to empty array', () => {
    const result = articleSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.connections).toEqual([]);
  });

  it('rejects invalid canonicalUrl', () => {
    const result = articleSchema.safeParse({ ...validBase, canonicalUrl: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('accepts valid canonicalUrl', () => {
    const result = articleSchema.safeParse({
      ...validBase,
      canonicalUrl: 'https://example.com/original-post/',
    });
    expect(result.success).toBe(true);
  });
});
