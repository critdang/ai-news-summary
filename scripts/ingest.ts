/**
 * scripts/ingest.ts
 *
 * Scheduled ingestion worker (run by GitHub Actions, cron + workflow_dispatch).
 *
 * For each configured source:
 *   1. Fetch + parse the RSS feed (SSRF-safe via src/lib/rss/parser).
 *   2. Deduplicate by canonical URL.
 *   3. For each NEW article: generate an AI summary (Groq primary, Gemini fallback).
 *   4. Persist articles, update Source / FeedHealth / IngestionRun.
 *
 * Reliability:
 *   - One source failing does NOT abort other sources (partial success).
 *   - One AI provider failing falls back to the next; partial results are kept.
 *   - Runs are idempotent: re-running does not create duplicates.
 *   - Limits articles per source, body/excerpt size, and AI calls per run.
 *   - Never retries permanent errors; transient errors get exponential backoff.
 *
 * Secrets (SUPABASE_SERVICE_ROLE_KEY / GEMINI_API_KEY / GROQ_API_KEY) are read
 * from environment only — never logged, never committed.
 */

import { prisma } from "../src/lib/prisma.ts";
import { parseFeed } from "../src/lib/rss/parser.ts";
import { summarizeArticle, type AIResult } from "../src/lib/aiProvider.ts";
import { canonicalizeUrl } from "../src/lib/urlUtils.ts";
import { categorySlug, DEFAULT_CATEGORIES } from "../src/lib/categoryUtils.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ARTICLES_PER_SOURCE = Number(
  process.env.MAX_ARTICLES_PER_SOURCE
) || 20;
const configuredRetryLimit = Number(process.env.MAX_ARTICLE_RETRIES_PER_RUN);
const MAX_ARTICLE_RETRIES_PER_RUN = Number.isFinite(configuredRetryLimit)
  ? Math.max(0, Math.floor(configuredRetryLimit))
  : 25;
const DEFAULT_LANGUAGE = process.env.DEFAULT_LANGUAGE || "vi";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SourceResult {
  sourceId: string;
  sourceUrl: string;
  fetched: number;
  new: number;
  skipped: number;
  aiCalls: number;
  aiFailures: number;
  error?: string;
}

interface RunResult {
  status: "completed" | "failed" | "partial";
  sourcesProcessed: number;
  sourceResults: SourceResult[];
  totalNew: number;
  totalAI: number;
  totalAIFailures: number;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function ensureSourcePreference(): Promise<void> {
  const existing = await prisma.userPreference.findFirst();
  if (!existing) {
    await prisma.userPreference.create({
      data: {
        language: DEFAULT_LANGUAGE,
        retentionDays: 45,
        aiProvider: process.env.AI_PROVIDER || "groq",
        aiModel: process.env.AI_MODEL || "gemini-3.8-flash",
        maxArticlesPerSource: MAX_ARTICLES_PER_SOURCE,
      },
    });
  }
}

export async function ensureDefaultCategories(): Promise<void> {
  for (const [sortOrder, name] of DEFAULT_CATEGORIES.entries()) {
    await prisma.category.upsert({
      where: { slug: categorySlug(name) },
      update: {},
      create: { name, slug: categorySlug(name), sortOrder },
    });
  }
}

export async function markStaleIngestionRuns(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 30 * 60 * 1000);
  const result = await prisma.ingestionRun.updateMany({
    where: { status: "running", startedAt: { lt: cutoff } },
    data: {
      status: "failed",
      completedAt: now,
      errorMessage: "Marked failed because the run did not finish within 30 minutes.",
    },
  });
  return result.count;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-source processing
// ─────────────────────────────────────────────────────────────────────────────

export async function processSource(
  source: {
    id: string;
    url: string;
    title: string;
    category: string;
  },
  options: { maxArticlesPerSource?: number; language?: string } = {}
): Promise<SourceResult> {
  const result: SourceResult = {
    sourceId: source.id,
    sourceUrl: source.url,
    fetched: 0,
    new: 0,
    skipped: 0,
    aiCalls: 0,
    aiFailures: 0,
  };

  let parsed;
  try {
    parsed = await parseFeed(source.url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Update feed health: record failure.
    await updateFeedHealth(source.id, false, message);
    await prisma.source.update({
      where: { id: source.id },
      data: { errorCount: { increment: 1 }, fetchError: message },
    });
    result.error = message;
    return result;
  }

  result.fetched = parsed.items.length;

  const maxArticlesPerSource = options.maxArticlesPerSource ?? MAX_ARTICLES_PER_SOURCE;
  const language = options.language ?? DEFAULT_LANGUAGE;
  const items = parsed.items.slice(0, maxArticlesPerSource);

  // Collect candidate canonical URLs to check for existing articles.
  const candidateUrls = items
    .map((item) => canonicalizeUrl(item.url))
    .filter((u): u is string => u.length > 0);

  const existingUrls = new Set<string>();
  if (candidateUrls.length > 0) {
    const existing = await prisma.article.findMany({
      where: { canonicalUrl: { in: candidateUrls } },
      select: { canonicalUrl: true },
    });
    for (const a of existing) existingUrls.add(a.canonicalUrl);
  }

  const seenCanonical = new Set<string>();

  for (const item of items) {
    const canonical = canonicalizeUrl(item.url);
    if (!canonical) {
      result.skipped++;
      continue;
    }

    // Dedup: skip if already in DB or seen within this run.
    if (existingUrls.has(canonical) || seenCanonical.has(canonical)) {
      result.skipped++;
      continue;
    }
    seenCanonical.add(canonical);

    const title = item.title || "Untitled";
    const excerpt = item.summary || item.content || null;

    // AI summarization (one call per article). A failure here does not lose the
    // article — we save it with processingStatus "failed" and retry later.
    let aiResult: AIResult | null = null;
    result.aiCalls++;
    try {
      const outcome = await summarizeArticle(title, excerpt, language);
      aiResult = outcome?.result ?? null;
      if (!outcome) result.aiFailures++;
    } catch {
      result.aiFailures++;
      // AI failed entirely; keep article with status "failed" for later retry.
    }

    try {
      await prisma.article.create({
        data: {
          title,
          url: item.url,
          canonicalUrl: canonical,
          excerpt: excerpt ? excerpt.slice(0, 2000) : null,
          summary: item.summary ?? null,
          aiSummary: aiResult?.summary ?? null,
          relevanceScore: aiResult?.relevanceScore ?? null,
          relevanceExplanation: aiResult?.relevanceExplanation ?? null,
          processingStatus: aiResult ? "completed" : "failed",
          publishedAt: item.publishedAt ?? null,
          sourceId: source.id,
          tags: aiResult?.tags ?? [],
          bookmarked: false,
        },
      });
      result.new++;
    } catch (err) {
      // A concurrent worker may insert the same canonical URL after our read.
      // Only suppress Prisma's unique-key conflict; preserve real DB failures.
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "P2002"
      ) {
        result.skipped++;
        continue;
      }
      throw err;
    }
  }

  // Mark source as successfully fetched.
  await updateFeedHealth(source.id, true);
  await prisma.source.update({
    where: { id: source.id },
    data: {
      lastFetched: new Date(),
      errorCount: 0,
      fetchError: null,
      title: parsed.title || source.title,
    },
  });

  return result;
}

export async function retryExistingArticles(
  language: string,
  limit = MAX_ARTICLE_RETRIES_PER_RUN
): Promise<{ attempted: number; completed: number; failed: number }> {
  if (limit <= 0) return { attempted: 0, completed: 0, failed: 0 };

  const articles = await prisma.article.findMany({
    where: { processingStatus: { in: ["pending", "failed"] } },
    orderBy: { createdAt: "asc" },
    take: Math.floor(limit),
    select: { id: true, title: true, excerpt: true, summary: true },
  });
  let completed = 0;
  let failed = 0;

  for (const article of articles) {
    try {
      const outcome = await summarizeArticle(
        article.title,
        article.excerpt || article.summary || null,
        language
      );
      if (!outcome) {
        failed++;
        continue;
      }

      const updated = await prisma.article.updateMany({
        where: {
          id: article.id,
          processingStatus: { in: ["pending", "failed"] },
        },
        data: {
          aiSummary: outcome.result.summary,
          relevanceScore: outcome.result.relevanceScore,
          relevanceExplanation: outcome.result.relevanceExplanation,
          tags: outcome.result.tags,
          processingStatus: "completed",
        },
      });
      completed += updated.count;
    } catch {
      failed++;
    }
  }

  return { attempted: articles.length, completed, failed };
}

async function updateFeedHealth(
  sourceId: string,
  success: boolean,
  error?: string
): Promise<void> {
  const health = await prisma.feedHealth.findUnique({ where: { sourceId } });
  if (success) {
    if (health) {
      await prisma.feedHealth.update({
        where: { sourceId },
        data: {
          consecutiveFailures: 0,
          lastSuccess: new Date(),
          lastError: null,
          lastChecked: new Date(),
        },
      });
    } else {
      await prisma.feedHealth.create({
        data: {
          sourceId,
          consecutiveFailures: 0,
          lastSuccess: new Date(),
          lastChecked: new Date(),
        },
      });
    }
  } else {
    const failures = health ? health.consecutiveFailures + 1 : 1;
    if (health) {
      await prisma.feedHealth.update({
        where: { sourceId },
        data: {
          consecutiveFailures: failures,
          lastError: error ?? null,
          lastChecked: new Date(),
        },
      });
    } else {
      await prisma.feedHealth.create({
        data: {
          sourceId,
          consecutiveFailures: failures,
          lastError: error ?? null,
          lastChecked: new Date(),
        },
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export async function runIngestion(): Promise<void> {
  await ensureDefaultCategories();
  await ensureSourcePreference();

  const preferences = await prisma.userPreference.findFirst({
    select: { language: true, maxArticlesPerSource: true },
  });
  const savedArticleLimit = preferences?.maxArticlesPerSource;
  const ingestionOptions = {
    language: preferences?.language || DEFAULT_LANGUAGE,
    maxArticlesPerSource:
      typeof savedArticleLimit === "number" && savedArticleLimit > 0
        ? savedArticleLimit
        : MAX_ARTICLES_PER_SOURCE,
  };

  const staleRunCount = await markStaleIngestionRuns();
  if (staleRunCount > 0) {
    console.warn(`[ingest] marked stale runs failed: ${staleRunCount}`);
  }

  const run = await prisma.ingestionRun.create({
    data: {
      status: "running",
      sourcesProcessed: 0,
    },
  });

  const retried = await retryExistingArticles(ingestionOptions.language).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ingest] Existing article retry query failed: ${message}`);
    return { attempted: 0, completed: 0, failed: 1 };
  });
  let totalAI = retried.attempted;
  let totalAIFailures = retried.failed;
  let hadError = retried.failed > 0;
  if (retried.attempted > 0) {
    console.log(
      `[ingest] retries: attempted=${retried.attempted} completed=${retried.completed} failed=${retried.failed}`
    );
  }

  const sources = await prisma.source.findMany({
    include: { category: { select: { name: true } } },
    orderBy: [{ category: { name: "asc" } }, { title: "asc" }],
  });

  if (sources.length === 0) {
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        sourcesProcessed: 0,
      },
    });
    console.log("No sources configured. Ingestion run completed.");
    return;
  }

  const sourceResults: SourceResult[] = [];
  let totalNew = 0;
  let totalFetched = 0;

  // Process sources sequentially (one failing does not abort the others).
  for (const source of sources) {
    const result = await processSource(
      { ...source, category: source.category.name },
      ingestionOptions
    ).catch((err) => {
      hadError = true;
      const message = err instanceof Error ? err.message : String(err);
      return {
        sourceId: source.id,
        sourceUrl: source.url,
        fetched: 0,
        new: 0,
        skipped: 0,
        aiCalls: 0,
        aiFailures: 0,
        error: message,
      };
    });
    sourceResults.push(result);
    totalNew += result.new;
    totalFetched += result.fetched;
    totalAI += result.aiCalls;
    totalAIFailures += result.aiFailures;
    if (result.error || result.aiFailures > 0) hadError = true;

    console.log(
      `[ingest] ${source.title} (${source.category}): fetched=${result.fetched} new=${result.new} skipped=${result.skipped} aiCalls=${result.aiCalls} aiFailures=${result.aiFailures}${
        result.error ? " error=" + result.error : ""
      }`
    );
  }

  const status: RunResult["status"] =
    hadError && totalNew === 0 && totalAI === 0
      ? "failed"
      : hadError
        ? "partial"
        : "completed";
  const sourceFailures = sourceResults.filter((result) => result.error).length;

  await prisma.ingestionRun.update({
    where: { id: run.id },
    data: {
      status,
      completedAt: new Date(),
      articleCount: totalFetched,
      newCount: totalNew,
      errorCount: sourceFailures + totalAIFailures,
      errorMessage: hadError
        ? [
            ...sourceResults.flatMap((r) => (r.error ? [r.error] : [])),
            totalAIFailures > 0
              ? `AI summaries failed for ${totalAIFailures} article(s)`
              : null,
          ]
            .filter((message): message is string => message !== null)
            .join("; ")
        : null,
      sourcesProcessed: sources.length,
    },
  });

  console.log(
    `[ingest] Run ${run.id} ${status}: sources=${sources.length} new=${totalNew} aiCalls=${totalAI} aiFailures=${totalAIFailures}`
  );
}

