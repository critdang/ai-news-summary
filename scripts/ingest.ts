/**
 * scripts/ingest.ts
 *
 * Scheduled ingestion worker (run by GitHub Actions, cron + workflow_dispatch).
 *
 * For each configured source:
 *   1. Fetch + parse the RSS feed (SSRF-safe via src/lib/rss/parser).
 *   2. Deduplicate by canonical URL.
 *   3. Persist new article metadata before summarizing cross-feed batches.
 *   4. Update only validated AI fields, plus Source / FeedHealth / IngestionRun.
 *
 * Reliability:
 *   - One source failing does NOT abort other sources (partial success).
 *   - One AI provider failing falls back to the next; partial results are kept.
 *   - Runs are idempotent: re-running does not create duplicates.
 *   - Splits the total new-article budget across sources; also bounds body size and retries.
 *   - Never retries permanent errors; transient errors get exponential backoff.
 *
 * Secrets (SUPABASE_SERVICE_ROLE_KEY / GEMINI_API_KEY / GROQ_API_KEY) are read
 * from environment only — never logged, never committed.
 */

import { prisma } from "../src/lib/prisma.ts";
import { parseFeed } from "../src/lib/rss/parser.ts";
import {
  summarizeArticle,
  summarizeBatch,
  type AIProviderSelection,
  type BatchArticleInput,
} from "../src/lib/aiProvider.ts";
import { canonicalizeUrl } from "../src/lib/urlUtils.ts";
import { categorySlug, DEFAULT_CATEGORIES } from "../src/lib/categoryUtils.ts";
import { allocateSourceArticleLimits } from "../src/lib/sourceLimits.ts";
import { mapWithConcurrency, prepareArticleBatches } from "../src/lib/batchProcessing.ts";
import { resolveAIModel } from "../src/lib/preferences.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ARTICLES_PER_RUN = Number(
  process.env.MAX_ARTICLES_PER_RUN || process.env.MAX_ARTICLES_PER_SOURCE
) || 50;
const configuredRetryLimit = Number(process.env.MAX_ARTICLE_RETRIES_PER_RUN);
const MAX_ARTICLE_RETRIES_PER_RUN = Number.isFinite(configuredRetryLimit)
  ? Math.max(0, Math.floor(configuredRetryLimit))
  : 25;
const MAX_ARTICLES_PER_BATCH = Math.max(1, Number(process.env.MAX_ARTICLES_PER_BATCH) || 15);
const MAX_BATCH_INPUT_CHARS = Math.max(500, Number(process.env.MAX_BATCH_INPUT_CHARS) || 20000);
const MAX_ARTICLE_EXCERPT_CHARS = Math.max(0, Number(process.env.MAX_ARTICLE_EXCERPT_CHARS) || 1200);
const MAX_AI_CALLS_PER_RUN = Math.max(1, Number(process.env.MAX_AI_CALLS_PER_RUN) || 20);
const FEED_FETCH_CONCURRENCY = Math.max(1, Number(process.env.FEED_FETCH_CONCURRENCY) || 4);
const AI_BATCH_CONCURRENCY = Math.max(1, Number(process.env.AI_BATCH_CONCURRENCY) || 2);
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

interface ArticleCandidate extends BatchArticleInput {
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
        aiModel: process.env.AI_PROVIDER === "gemini"
          ? process.env.AI_MODEL || "gemini-3.8-flash"
          : process.env.GROQ_MODEL || "openai/gpt-oss-20b",
        maxArticlesPerSource: MAX_ARTICLES_PER_RUN,
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
    const excerpt = item.summary || item.content || null;
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

export async function retryExistingArticles(
  language: string,
  limit = MAX_ARTICLE_RETRIES_PER_RUN,
  providerSelection?: AIProviderSelection
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
        language,
        providerSelection
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
  const startedAt = Date.now();
  await ensureDefaultCategories();
  await ensureSourcePreference();

  const preferences = await prisma.userPreference.findFirst({
    select: { language: true, maxArticlesPerSource: true, aiProvider: true, aiModel: true },
  });
  const savedArticleLimit = preferences?.maxArticlesPerSource;
  const preferredProvider = preferences?.aiProvider || process.env.AI_PROVIDER || "groq";
  const supportedProvider = preferredProvider === "gemini" || preferredProvider === "mock" ? preferredProvider : "groq";
  const ingestionOptions = {
    language: preferences?.language || DEFAULT_LANGUAGE,
    providerSelection: {
      provider: supportedProvider as AIProviderSelection["provider"],
      model: resolveAIModel(supportedProvider, preferences?.aiModel),
    },
    totalArticleBudget:
      typeof savedArticleLimit === "number" && savedArticleLimit > 0
        ? savedArticleLimit
        : MAX_ARTICLES_PER_RUN,
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

  const retried = await retryExistingArticles(
    ingestionOptions.language,
    MAX_ARTICLE_RETRIES_PER_RUN,
    ingestionOptions.providerSelection
  ).catch((err) => {
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
  const sourceAllocations = allocateSourceArticleLimits(sources, ingestionOptions.totalArticleBudget);

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
  const sourceResults: SourceResult[] = fetchedSources.map(({ source, fetched }) => ({
    sourceId: source.id,
    sourceUrl: source.url,
    fetched: fetched.fetched,
    new: 0,
    skipped: fetched.skipped,
    aiCalls: 0,
    aiFailures: 0,
    ...(fetched.error ? { error: fetched.error } : {}),
  }));
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
    where: { canonicalUrl: { in: candidates.map((candidate) => candidate.canonicalUrl) } },
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
  const pending = newCandidates.length ? await prisma.article.findMany({
    where: {
      canonicalUrl: { in: newCandidates.map((candidate) => candidate.canonicalUrl) },
      processingStatus: "pending",
      aiSummary: null,
    },
    select: { id: true, canonicalUrl: true },
  }) : [];
  const candidateByUrl = new Map(newCandidates.map((candidate) => [candidate.canonicalUrl, candidate]));
  const prepared = prepareArticleBatches(
    pending.flatMap((article) => {
      const candidate = candidateByUrl.get(article.canonicalUrl);
      return candidate ? [{
        canonicalUrl: candidate.canonicalUrl,
        title: candidate.title,
        publisher: candidate.publisher,
        publishedAt: candidate.publishedAt,
        excerpt: candidate.excerpt,
        category: candidate.category,
      }] : [];
    }),
    { maxArticles: MAX_ARTICLES_PER_BATCH, maxInputChars: MAX_BATCH_INPUT_CHARS, maxExcerptChars: MAX_ARTICLE_EXCERPT_CHARS }
  );
  const articleByUrl = new Map(pending.map((article) => [article.canonicalUrl, article]));
  let batchCalls = 0;
  const inputCharacters = prepared.inputCharacters;
  const batchesToRun = prepared.batches.slice(0, MAX_AI_CALLS_PER_RUN);
  if (prepared.batches.length > batchesToRun.length) hadError = true;
  const batchOutcomes = await mapWithConcurrency(batchesToRun, AI_BATCH_CONCURRENCY, async (batch) => {
    batchCalls++;
    const result = await summarizeBatch(batch, ingestionOptions.language, ingestionOptions.providerSelection);
    return { batch, result };
  });
  let successfulSummaries = 0;
  let batchFailures = 0;
  let reportedInputTokens = 0;
  let reportedOutputTokens = 0;
  let tokenUsageComplete = true;
  const usedProviders = new Set<string>();
  const usedModels = new Set<string>();
  const failedCanonicalUrls = new Set<string>();
  for (const { batch, result } of batchOutcomes) {
    if (!result) {
      batchFailures += batch.length;
      batch.forEach((article) => failedCanonicalUrls.add(article.canonicalUrl));
      continue;
    }
    usedProviders.add(result.provider);
    usedModels.add(result.model);
    if (typeof result.usage.inputTokens === "number" && typeof result.usage.outputTokens === "number") {
      reportedInputTokens += result.usage.inputTokens;
      reportedOutputTokens += result.usage.outputTokens;
    } else {
      tokenUsageComplete = false;
    }
    const outputByUrl = new Map(result.results.map((item) => [item.canonicalUrl, item]));
    for (const batchArticle of batch) {
      const output = outputByUrl.get(batchArticle.canonicalUrl);
      const stored = articleByUrl.get(batchArticle.canonicalUrl);
      if (!output || !stored) {
        batchFailures++;
        failedCanonicalUrls.add(batchArticle.canonicalUrl);
        continue;
      }
      const updated = await prisma.article.updateMany({
        where: { id: stored.id, processingStatus: "pending", aiSummary: null },
        data: {
          aiSummary: output.summary,
          relevanceScore: output.relevanceScore,
          relevanceExplanation: output.relevanceExplanation,
          tags: output.tags,
          processingStatus: "completed",
        },
      });
      successfulSummaries += updated.count;
      if (updated.count === 0) failedCanonicalUrls.add(batchArticle.canonicalUrl);
    }
  }
  const totalNew = newCandidates.length;
  totalAI += batchCalls;
  totalAIFailures += batchFailures + prepared.skipped.length;
  if (totalAIFailures > 0 || fetchedSources.some((item) => item.fetched.error)) hadError = true;
  for (const sourceResult of sourceResults) {
    sourceResult.new = newCandidates.filter((candidate) => candidate.sourceId === sourceResult.sourceId).length;
    sourceResult.aiCalls = batchesToRun.filter((batch) => batch.some((article) =>
      candidateByUrl.get(article.canonicalUrl)?.sourceId === sourceResult.sourceId
    )).length;
    sourceResult.aiFailures = newCandidates.filter((candidate) =>
      candidate.sourceId === sourceResult.sourceId && failedCanonicalUrls.has(candidate.canonicalUrl)
    ).length;
    const error = fetchedSources.find((item) => item.fetched.sourceId === sourceResult.sourceId)?.fetched.error;
    if (error) sourceResult.error = error;
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
    `[ingest] Run ${run.id} ${status}: sources=${sources.length} fetched=${totalFetched} new=${totalNew} duplicates=${duplicateCount} batches=${batchCalls} providers=${[...usedProviders].join(",") || "none"} models=${[...usedModels].join(",") || "none"} inputChars=${inputCharacters} estimatedInputTokens=${Math.ceil(inputCharacters / 4)} reportedInputTokens=${tokenUsageComplete ? reportedInputTokens : "partial/unavailable"} reportedOutputTokens=${tokenUsageComplete ? reportedOutputTokens : "partial/unavailable"} summaries=${successfulSummaries} aiFailures=${totalAIFailures} durationMs=${Date.now() - startedAt}`
  );
}

