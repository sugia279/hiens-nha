import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
import { legacyContentId } from './lib/content/entry-id';
import { normalizeImportedArticle } from './lib/content/imported-articles';

// ---------------------------------------------------------------------------
// Shared fragments
// ---------------------------------------------------------------------------

/** Five approved knowledge domain slugs. */
const domainEnum = z.enum([
  'engineering',
  'artificial-intelligence',
  'music',
  'reading-literature',
  'philosophy-life',
]);

/** Seven approved relationship types. */
const connectionTypeEnum = z.enum([
  'prerequisite',
  'explains',
  'extends',
  'contrasts',
  'applies-to',
  'derived-from',
  'related',
]);

/** A single authored content connection. */
const contentConnectionSchema = z.object({
  type: connectionTypeEnum,
  target: z.object({
    collection: z.enum(['articles', 'notes', 'projects', 'series']),
    id: z.string().min(1),
  }),
  context: z.string().optional(),
});

/** Optional content image with required alt text. */
const contentImageSchema = z.object({
  src: z.string().min(1),
  alt: z.string(),
  caption: z.string().optional(),
});

/** Shared fields across all four collections. */
const sharedSchema = z.object({
  title: z.string().min(1).transform((s) => s.trim()),
  description: z.string().min(1).transform((s) => s.trim()),
  publishedAt: z.coerce.date(),
  updatedAt: z.coerce.date().optional(),
  draft: z.boolean().optional().default(false),
  tags: z.array(z.string().min(1)).min(1),
  domains: z.array(domainEnum).min(1),
  connections: z.array(contentConnectionSchema).optional().default([]),
  image: contentImageSchema.optional(),
  canonicalUrl: z.url().optional(),
});

// ---------------------------------------------------------------------------
// Article collection
// ---------------------------------------------------------------------------

const articles = defineCollection({
  loader: glob({base:'./src/content/articles',pattern:['**/*{.md,.mdx}','!**/_*/**/*{.md,.mdx}','!**/_*{.md,.mdx}'],generateId:legacyContentId}),
  schema: z.preprocess(normalizeImportedArticle, sharedSchema.extend({
    featured: z.boolean().optional().default(false),
    showTableOfContents: z.boolean().optional().default(true),
    series: z.string().optional(),
    seriesOrder: z.number().int().positive().optional(),
    chapterOrder: z.number().int().positive().optional(),
  }).refine(
    (data) => {
      const hasSeries = data.series !== undefined;
      const hasOrder = data.seriesOrder !== undefined;
      return hasSeries === hasOrder;
    },
    { message: 'series and seriesOrder must both be present or both be absent' },
  )),
});

// ---------------------------------------------------------------------------
// Note collection
// ---------------------------------------------------------------------------

const notes = defineCollection({
  loader: glob({base:'./src/content/notes',pattern:['**/*{.md,.mdx}','!**/_*/**/*{.md,.mdx}','!**/_*{.md,.mdx}'],generateId:legacyContentId}),
  schema: sharedSchema.extend({
    maturity: z.enum(['seed', 'growing', 'evergreen']),
  }),
});

// ---------------------------------------------------------------------------
// Project collection
// ---------------------------------------------------------------------------

const projectPeriodSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be YYYY-MM'),
  end: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be YYYY-MM').optional(),
});

const projects = defineCollection({
  loader: glob({base:'./src/content/projects',pattern:['**/*{.md,.mdx}','!**/_*/**/*{.md,.mdx}','!**/_*{.md,.mdx}'],generateId:legacyContentId}),
  schema: sharedSchema.extend({
    status: z.enum(['active', 'maintained', 'completed', 'archived']),
    role: z.string().min(1).transform((s) => s.trim()),
    skills: z.array(z.string().min(1)).min(1),
    tools: z.array(z.string().min(1)).optional().default([]),
    period: projectPeriodSchema,
    repositoryUrl: z.url().optional(),
    liveUrl: z.url().optional(),
    featured: z.boolean().optional().default(false),
  }).refine(
    (data) => {
      if (!data.period.end) return true;
      return data.period.end >= data.period.start;
    },
    { message: 'period.end must not be before period.start' },
  ),
});

// ---------------------------------------------------------------------------
// Series collection
// ---------------------------------------------------------------------------

const seriesEntryReferenceSchema = z.object({
  collection: z.enum(['articles', 'notes']),
  id: z.string().min(1),
});

const series = defineCollection({
  loader: glob({base:'./src/content/series',pattern:['**/*{.md,.mdx}','!**/_*/**/*{.md,.mdx}','!**/_*{.md,.mdx}'],generateId:legacyContentId}),
  schema: sharedSchema.extend({
    entries: z.array(seriesEntryReferenceSchema).min(1),
  }),
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const collections = { articles, notes, projects, series };
