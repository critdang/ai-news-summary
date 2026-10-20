/**
 * scripts/ingest.ts
 *
 * Scheduled ingestion worker (run by Vercel Cron or the local CLI).
 *
 * For each configured source:
 *   1. Fetch + parse the RSS feed (SSRF-safe via src/lib/rss/parser).
 *   2. Deduplicate by canonical URL.
 *   3. Persist new article metadata for on-demand summarization in the reader.
 *   4. Update Source / FeedHealth / IngestionRun diagnostics.
 *
 * Reliability:
 *   - One source failing does NOT abort other sources (partial success).
 *   - Runs are idempotent: re-running does not create duplicates.
 *   - Splits the total new-article budget across sources.
 *   - Never retries permanent errors; transient errors get exponential backoff.
 *
 * Database credentials are read from the environment only — never logged,
 * never committed. This worker does not call AI providers.
 */

import { prisma } from "../src/lib/prisma.ts";
import { parseFeed } from "../src/lib/rss/parser.ts";
import { canonicalizeUrl } from "../src/lib/urlUtils.ts";
import { categorySlug, DEFAULT_CATEGORIES } from "../src/lib/categoryUtils.ts";
import { allocateSourceArticleLimits } from "../src/lib/sourceLimits.ts";
import { mapWithConcurrency } from "../src/lib/batchProcessing.ts";
import { isScheduledIngestionDue } from "../src/lib/ingestionSchedule.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ARTICLES_PER_RUN = Number(
  process.env.MAX_ARTICLES_PER_RUN || process.env.MAX_ARTICLES_PER_SOURCE
) || 50;
const FEED_FETCH_CONCURRENCY = Math.max(1, Number(process.env.FEED_FETCH_CONCURRENCY) || 4);
const DEFAULT_LANGUAGE = process.env.DEFAULT_LANGUAGE || "vi";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ArticleCandidate {
  canonicalUrl: string;
  title: string;
  publisher: string;
  publishedAt: string | null;
  excerpt: string | null;
  category: string;
  sourceId: string;
  url: string;
  originalTitle: string;
  summary: string | null;
  imageUrl: string | null;
}

interface SourceFetchResult {
  sourceId: string;
  sourceUrl: string;
  fetched: number;
  skipped: number;
  candidates: ArticleCandidate[];
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function ensureSourcePreference(userId: string): Promise<void> {
  const existing = await prisma.userPreference.findUnique({ where: { userId } });
  if (!existing) {
    await prisma.userPreference.create({
      data: {
        language: DEFAULT_LANGUAGE,
        retentionDays: 45,
        aiProvider: process.env.AI_PROVIDER || "groq",
        aiModel: process.env.AI_PROVIDER === "gemini"
          ? process.env.AI_MODEL || "gemini-3.8-flash"
          : process.env.GROQ_MODEL || "openai/gpt-oss-20b",
        maxArticlesPerSource: MAX_ARTICLES_PER_RUN,
        ingestionIntervalHours: 12,
        userId,
      },
    });
  }
}

export async function ensureDefaultCategories(userId: string): Promise<void> {
  for (const [sortOrder, name] of DEFAULT_CATEGORIES.entries()) {
    await prisma.category.upsert({
      where: { userId_slug: { userId, slug: categorySlug(name) } },
      update: {},
      create: { name, slug: categorySlug(name), sortOrder, userId },
    });
  }
}

export async function markStaleIngestionRuns(now = new Date(), userId?: string): Promise<number> {
  const cutoff = new Date(now.getTime() - 30 * 60 * 1000);
  const result = await prisma.ingestionRun.updateMany({
    where: { status: "running", startedAt: { lt: cutoff }, ...(userId ? { userId } : {}) },
    data: {
      status: "failed",
      completedAt: now,
      errorMessage: "Marked failed because the run did not finish within 30 minutes.",
    },
  });
  return result.count;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-source fetch and normalization
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchSourceCandidates(
  source: {
    id: string;
    url: string;
    title: string;
    category: string;
  },
  articleLimit: number
): Promise<SourceFetchResult> {
  const result: SourceFetchResult = {
    sourceId: source.id,
    sourceUrl: source.url,
    fetched: 0,
    skipped: 0,
    candidates: [],
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
  const items = parsed.items.slice(0, Math.max(0, articleLimit));

  for (const item of items) {
    const canonical = canonicalizeUrl(item.url);
    if (!canonical) {
      result.skipped++;
      continue;
    }
    const excerpt = item.content || item.summary || null;
    result.candidates.push({
      canonicalUrl: canonical,
      title: item.title || "Untitled",
      originalTitle: item.title || "Untitled",
      publisher: parsed.title || source.title,
      publishedAt: item.publishedAt?.toISOString() ?? null,
      excerpt: excerpt ? excerpt.slice(0, 2000) : null,
      category: source.category,
      sourceId: source.id,
      url: item.url,
      summary: item.summary ?? null,
      imageUrl: item.imageUrl,
    });
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

export async function runIngestion(options: { scheduled?: boolean; userId?: string } = {}): Promise<void> {
  const scheduled = options.scheduled ?? process.env.INGESTION_SCHEDULED === "true";
  if (!options.userId) {
    const users = await prisma.user.findMany({ select: { id: true } });
    for (const user of users) await runIngestion({ scheduled, userId: user.id });
    return;
  }
  const userId = options.userId;
  const startedAt = Date.now();
  await ensureDefaultCategories(userId);
  await ensureSourcePreference(userId);

  const preferences = await prisma.userPreference.findUnique({ where: { userId },
    select: { maxArticlesPerSource: true, ingestionIntervalHours: true },
  });
  if (scheduled) {
    const latestRun = await prisma.ingestionRun.findFirst({
      where: { scheduled: true, completedAt: { not: null }, userId },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    });
    const intervalHours = preferences?.ingestionIntervalHours ?? 12;
    if (!isScheduledIngestionDue(latestRun?.completedAt ?? null, intervalHours)) {
      console.log(`[ingest] scheduled run skipped; the ${intervalHours}-hour interval has not elapsed`);
      return;
    }
  }
  const savedArticleLimit = preferences?.maxArticlesPerSource;
  const totalArticleBudget =
    typeof savedArticleLimit === "number" && savedArticleLimit > 0
      ? savedArticleLimit
      : MAX_ARTICLES_PER_RUN;

  const staleRunCount = await markStaleIngestionRuns(new Date(), userId);
  if (staleRunCount > 0) {
    console.warn(`[ingest] marked stale runs failed: ${staleRunCount}`);
  }

  const run = await prisma.ingestionRun.create({
    data: {
      status: "running",
      scheduled,
      userId,
      sourcesProcessed: 0,
    },
  });

  const sources = await prisma.source.findMany({
    where: { userId },
    include: { category: { select: { name: true } } },
    orderBy: [{ category: { name: "asc" } }, { title: "asc" }],
  });
  const sourceAllocations = allocateSourceArticleLimits(sources, totalArticleBudget);

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

  const eligibleSources = sources.filter((source) => (sourceAllocations.get(source.id) ?? 0) > 0);
  const fetchedSources = await mapWithConcurrency(eligibleSources, FEED_FETCH_CONCURRENCY, async (source) => {
    const fetched = await fetchSourceCandidates(
      { ...source, category: source.category.name },
      sourceAllocations.get(source.id) ?? 0
    );
    return { source, fetched };
  });
  const hadError = fetchedSources.some(({ fetched }) => Boolean(fetched.error));
  const totalFetched = fetchedSources.reduce((sum, item) => sum + item.fetched.fetched, 0);
  let duplicateCount = fetchedSources.reduce((sum, item) => sum + item.fetched.skipped, 0);
  const uniqueCandidates = new Map<string, ArticleCandidate>();
  for (const { fetched } of fetchedSources) {
    for (const candidate of fetched.candidates) {
      if (uniqueCandidates.has(candidate.canonicalUrl)) duplicateCount++;
      else uniqueCandidates.set(candidate.canonicalUrl, candidate);
    }
  }
  const candidates = [...uniqueCandidates.values()];
  const existing = candidates.length ? await prisma.article.findMany({
    where: { canonicalUrl: { in: candidates.map((candidate) => candidate.canonicalUrl) }, source: { userId } },
    select: { canonicalUrl: true },
  }) : [];
  const existingUrls = new Set(existing.map((article) => article.canonicalUrl));
  const newCandidates = candidates.filter((candidate) => !existingUrls.has(candidate.canonicalUrl));
  duplicateCount += candidates.length - newCandidates.length;

  if (newCandidates.length) {
    await prisma.article.createMany({
      data: newCandidates.map((candidate) => ({
        title: candidate.originalTitle,
        url: candidate.canonicalUrl,
        canonicalUrl: candidate.canonicalUrl,
        excerpt: candidate.excerpt,
        summary: candidate.summary,
        publishedAt: candidate.publishedAt ? new Date(candidate.publishedAt) : null,
        sourceId: candidate.sourceId,
        processingStatus: "pending",
        aiSummary: null,
      })),
      skipDuplicates: true,
    });
  }
  const totalNew = newCandidates.length;
  const status: "completed" | "failed" | "partial" =
    hadError && totalNew === 0 ? "failed" : hadError ? "partial" : "completed";
  const sourceFailures = fetchedSources.filter(({ fetched }) => fetched.error).length;

  await prisma.ingestionRun.update({
    where: { id: run.id },
    data: {
      status,
      completedAt: new Date(),
      articleCount: totalFetched,
      newCount: totalNew,
      errorCount: sourceFailures,
      errorMessage: hadError
        ? fetchedSources.flatMap(({ fetched }) => fetched.error ? [fetched.error] : []).join("; ")
        : null,
      sourcesProcessed: sources.length,
    },
  });

  console.log(
    `[ingest] Run ${run.id} ${status}: sources=${sources.length} fetched=${totalFetched} new=${totalNew} duplicates=${duplicateCount} durationMs=${Date.now() - startedAt}`
  );
}

