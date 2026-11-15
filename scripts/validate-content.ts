/**
 * Content validation script.
 * Run via: npm run validate:content
 *
 * Reads MDX files from src/content/ directly (no astro:content virtual module)
 * so it can run as a standalone Node.js/tsx script outside Astro's build context.
 *
 * Validates:
 *  - Frontmatter schema (4 collections, Zod)
 *  - Cross-entry connection targets (missing, draft, self, bad collection)
 *  - Symmetric related reverse-duplicate detection
 *  - Prerequisite cycle detection
 *  - Series entry resolution (missing, draft, duplicates)
 *  - Duplicate IDs within each collection
 *
 * Exits with code 1 on any validation failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { z } from 'astro/zod';
import { normalizeImportedArticle } from '../src/lib/content/imported-articles';
import { legacyContentId } from '../src/lib/content/entry-id';

// ---------------------------------------------------------------------------
// Schema (mirrors content.config.ts; no astro:content import here)
// ---------------------------------------------------------------------------

const domainEnum = z.enum([
  'engineering',
  'artificial-intelligence',
  'music',
  'reading-literature',
  'philosophy-life',
]);

const connectionTypeEnum = z.enum([
  'prerequisite', 'explains', 'extends', 'contrasts',
  'applies-to', 'derived-from', 'related',
]);

const connectionSchema = z.object({
  type: connectionTypeEnum,
  target: z.object({
    collection: z.enum(['articles', 'notes', 'projects', 'series']),
    id: z.string().min(1),
  }),
  context: z.string().optional(),
});

const sharedSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  publishedAt: z.coerce.date(),
  updatedAt: z.coerce.date().optional(),
  draft: z.boolean().optional().default(false),
  tags: z.array(z.string().min(1)).min(1),
  domains: z.array(domainEnum).min(1),
  connections: z.array(connectionSchema).optional().default([]),
  canonicalUrl: z.url().optional(),
});

const articleSchema = sharedSchema.extend({
  featured: z.boolean().optional().default(false),
  showTableOfContents: z.boolean().optional().default(true),
  series: z.string().optional(),
  seriesOrder: z.number().int().positive().optional(),
  chapterOrder: z.number().int().positive().optional(),
}).refine((d) => (d.series !== undefined) === (d.seriesOrder !== undefined), {
  message: 'series and seriesOrder must both be present or both be absent',
});

const noteSchema = sharedSchema.extend({
  maturity: z.enum(['seed', 'growing', 'evergreen']),
});

const projectSchema = sharedSchema.extend({
  status: z.enum(['active', 'maintained', 'completed', 'archived']),
  role: z.string().min(1),
  skills: z.array(z.string().min(1)).min(1),
  tools: z.array(z.string().min(1)).optional().default([]),
  period: z.object({
    start: z.string().regex(/^\d{4}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  }),
  repositoryUrl: z.url().optional(),
  liveUrl: z.url().optional(),
  featured: z.boolean().optional().default(false),
}).refine((d) => !d.period.end || d.period.end >= d.period.start, {
  message: 'period.end must not be before period.start',
});

const seriesSchema = sharedSchema.extend({
  entries: z.array(z.object({
    collection: z.enum(['articles', 'notes']),
    id: z.string().min(1),
  })).min(1),
});

const collectionSchemas = {
  articles: articleSchema,
  notes: noteSchema,
  projects: projectSchema,
  series: seriesSchema,
} as const;

// ---------------------------------------------------------------------------
// Entry loading
// ---------------------------------------------------------------------------

interface LoadedEntry {
  collection: 'articles' | 'notes' | 'projects' | 'series';
  id: string;
  nodeId: string;
  data: Record<string, unknown>;
  draft: boolean;
  filePath: string;
}

function loadCollection(
  collection: 'articles' | 'notes' | 'projects' | 'series',
  contentRoot: string,
): LoadedEntry[] {
  const dir = path.join(contentRoot, collection);
  if (!fs.existsSync(dir)) return [];

  const entries: LoadedEntry[] = [];
  const files = fs.readdirSync(dir, { recursive: true }) as string[];

  for (const file of files) {
    if (!file.endsWith('.mdx') && !file.endsWith('.md')) continue;
    const fullPath = path.join(dir, file);
    const raw = fs.readFileSync(fullPath, 'utf-8');
    const { data } = matter(raw);

    // Match actual Content Layer identity, including its preserved legacy extension.
    const id = legacyContentId({ entry: file });

    entries.push({
      collection,
      id,
      nodeId: `${collection}:${id}`,
      data: (collection === 'articles' ? normalizeImportedArticle(data) : data) as Record<string, unknown>,
      draft: Boolean(data['draft']),
      filePath: fullPath,
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Main validation logic
// ---------------------------------------------------------------------------

function main(): void {
  const repoRoot = path.resolve(import.meta.dirname, '..');
  const contentRoot = path.join(repoRoot, 'src', 'content');
  const errors: string[] = [];

  // Load all entries
  const collectionNames = ['articles', 'notes', 'projects', 'series'] as const;
  const allByCollection: Record<string, LoadedEntry[]> = {};

  for (const col of collectionNames) {
    allByCollection[col] = loadCollection(col, contentRoot);
  }

  const allEntries = Object.values(allByCollection).flat();
  const published = allEntries.filter((e) => !e.draft);
  const publishedIds = new Set(published.map((e) => e.nodeId));
  const allIds = new Set(allEntries.map((e) => e.nodeId));

  // 1. Schema validation
  for (const entry of allEntries) {
    const schema = collectionSchemas[entry.collection];
    const result = schema.safeParse(entry.data);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(`[schema] ${entry.nodeId} (${issue.path.join('.')}): ${issue.message}`);
      }
    }
  }

  // 2. Duplicate IDs within each collection
  for (const col of collectionNames) {
    const ids = (allByCollection[col] ?? []).map((e) => e.id);
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`[duplicate] ${col}:${id}`);
      seen.add(id);
    }
  }

  // 3. Connection target validation (published entries only)
  const relatedPairs = new Set<string>();

  for (const entry of published) {
    const connections = (entry.data['connections'] as Array<{ type: string; target: { collection: string; id: string } }> | undefined) ?? [];

    const seenEdges = new Set<string>();
    for (const conn of connections) {
      const targetId = `${conn.target.collection}:${conn.target.id}`;
      const edgeKey = `${conn.type}:${targetId}`;

      if (seenEdges.has(edgeKey)) {
        errors.push(`[graph/duplicate] ${entry.nodeId} → ${targetId}: Duplicate ${conn.type} connection`);
        continue;
      }
      seenEdges.add(edgeKey);

      if (targetId === entry.nodeId) {
        errors.push(`[graph/self] ${entry.nodeId}: Self-reference in connections`);
        continue;
      }

      if (!publishedIds.has(targetId)) {
        const isDraft = allIds.has(targetId);
        errors.push(`[graph/target] ${entry.nodeId} → ${targetId}: ${isDraft ? 'Target is draft' : 'Target not found'}`);
      }

      // Symmetric related reverse-duplicate check
      if (conn.type === 'related') {
        const reverseKey = `${targetId}→${entry.nodeId}`;
        if (relatedPairs.has(reverseKey)) {
          errors.push(`[graph/related] ${entry.nodeId} → ${targetId}: Reverse-duplicate related edge — author one direction only`);
        }
        relatedPairs.add(`${entry.nodeId}→${targetId}`);
      }
    }
  }

  // 4. Prerequisite cycle detection (DFS)
  const adj = new Map<string, string[]>();
  for (const e of published) adj.set(e.nodeId, []);
  for (const e of published) {
    const connections = (e.data['connections'] as Array<{ type: string; target: { collection: string; id: string } }> | undefined) ?? [];
    for (const conn of connections) {
      if (conn.type === 'prerequisite') {
        const targetId = `${conn.target.collection}:${conn.target.id}`;
        adj.get(e.nodeId)?.push(targetId);
      }
    }
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(node: string, path: string[]): void {
    if (inStack.has(node)) {
      const start = path.indexOf(node);
      errors.push(`[graph/cycle] Prerequisite cycle: ${[...path.slice(start), node].join(' → ')}`);
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    inStack.add(node);
    path.push(node);
    for (const neighbor of adj.get(node) ?? []) dfs(neighbor, path);
    path.pop();
    inStack.delete(node);
  }

  for (const nodeId of adj.keys()) {
    if (!visited.has(nodeId)) dfs(nodeId, []);
  }

  // 5. Series resolution
  const publishedArticles = new Map((allByCollection['articles'] ?? []).filter((e) => !e.draft).map((e) => [e.id, e]));
  const publishedNotes = new Map((allByCollection['notes'] ?? []).filter((e) => !e.draft).map((e) => [e.id, e]));
  const allArticleIds = new Set((allByCollection['articles'] ?? []).map((e) => e.id));
  const allNoteIds = new Set((allByCollection['notes'] ?? []).map((e) => e.id));

  for (const s of (allByCollection['series'] ?? []).filter((e) => !e.draft)) {
    const entries = (s.data['entries'] as Array<{ collection: string; id: string }> | undefined) ?? [];
    const seen = new Set<string>();
    for (let i = 0; i < entries.length; i++) {
      const ref = entries[i]!;
      const key = `${ref.collection}:${ref.id}`;
      if (seen.has(key)) {
        errors.push(`[series] ${s.id}: Duplicate entry ${key} at position ${i + 1}`);
        continue;
      }
      seen.add(key);

      const map = ref.collection === 'articles' ? publishedArticles : publishedNotes;
      const allIds = ref.collection === 'articles' ? allArticleIds : allNoteIds;

      if (!map.has(ref.id)) {
        const isDraft = allIds.has(ref.id);
        errors.push(`[series] ${s.id}: Entry ${key} at position ${i + 1} is ${isDraft ? 'a draft' : 'not found'}`);
      }
    }
  }

  // Report
  if (errors.length > 0) {
    console.error(`\nContent validation failed with ${errors.length} error(s):\n`);
    for (const err of errors) console.error(`  ✗ ${err}`);
    process.exit(1);
  }

  const entryCount = published.length;
  console.log(`Content validation passed. ${entryCount} published ${entryCount === 1 ? 'entry' : 'entries'} validated.`);
}

main();
