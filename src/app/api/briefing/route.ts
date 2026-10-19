import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { summarizeBatch, type AIProviderSelection, type BatchArticleInput } from "@/lib/aiProvider";
import { mapWithConcurrency, prepareArticleBatches } from "@/lib/batchProcessing";
import { briefingImpact } from "@/lib/briefing";
import { resolveAIModel } from "@/lib/preferences";
import { parseFeed } from "@/lib/rss/parser";
import { canonicalizeUrl } from "@/lib/urlUtils";
import { allocateSourceArticleLimits } from "@/lib/sourceLimits";

export const maxDuration = 60;

const ALLOWED_HOURS = new Set([12, 24, 48, 72, 168]);
const MAX_BRIEFING_ARTICLES = 50;
const FEED_FETCH_CONCURRENCY = 4;
const MAX_FEED_ARTICLES = 50;

type BriefingSource = {
  id: string;
  title: string;
  url: string;
  maxArticlesPerRun: number | null;
  category: { name: string };
};

function providerSelection(preference: { aiProvider: string; aiModel: string } | null): AIProviderSelection {
  const environmentProvider = process.env.AI_PROVIDER === "gemini" || process.env.AI_PROVIDER === "mock"
    ? process.env.AI_PROVIDER
    : "groq";
  const provider = preference?.aiProvider === "gemini" || preference?.aiProvider === "groq" || preference?.aiProvider === "mock"
    ? preference.aiProvider
    : environmentProvider;
  return {
    provider,
    model: resolveAIModel(provider, preference?.aiModel),
  };
}

async function updateSourceHealth(sourceId: string, error?: string) {
  const checkedAt = new Date();
  if (error) {
    await Promise.all([
      prisma.source.update({
        where: { id: sourceId },
        data: { errorCount: { increment: 1 }, fetchError: error },
      }),
      prisma.feedHealth.upsert({
        where: { sourceId },
        update: { consecutiveFailures: { increment: 1 }, lastError: error, lastChecked: checkedAt },
        create: { sourceId, consecutiveFailures: 1, lastError: error, lastChecked: checkedAt },
      }),
    ]);
    return;
  }
  await Promise.all([
    prisma.source.update({
      where: { id: sourceId },
      data: { lastFetched: checkedAt, errorCount: 0, fetchError: null },
    }),
    prisma.feedHealth.upsert({
      where: { sourceId },
      update: { consecutiveFailures: 0, lastSuccess: checkedAt, lastError: null, lastChecked: checkedAt },
      create: { sourceId, consecutiveFailures: 0, lastSuccess: checkedAt, lastChecked: checkedAt },
    }),
  ]);
}

async function fetchSelectedSources(sources: BriefingSource[], totalLimit: number) {
  const allocations = allocateSourceArticleLimits(sources, totalLimit);
  const eligibleSources = sources.filter((source) => (allocations.get(source.id) ?? 0) > 0);
  const fetched = await mapWithConcurrency(eligibleSources, FEED_FETCH_CONCURRENCY, async (source) => {
    try {
      const feed = await parseFeed(source.url);
      await updateSourceHealth(source.id);
      const limit = Math.min(allocations.get(source.id) ?? 0, MAX_FEED_ARTICLES);
      const candidates = feed.items.slice(0, limit).flatMap((item) => {
        const canonicalUrl = canonicalizeUrl(item.url);
        if (!canonicalUrl) return [];
        const excerpt = item.content || item.summary || null;
        return [{
          canonicalUrl,
          title: item.title || "Untitled",
          url: canonicalUrl,
          excerpt: excerpt?.slice(0, 2_000) ?? null,
          summary: item.summary?.slice(0, 500) ?? null,
          publishedAt: item.publishedAt,
          sourceId: source.id,
        }];
      });
      return { source, itemCount: feed.items.length, candidates, error: null };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message.slice(0, 500) : "Feed request failed";
      await updateSourceHealth(source.id, message);
      console.error(`[briefing] Could not fetch source ${source.id}: ${message}`);
      return { source, itemCount: 0, candidates: [], error: message };
    }
  });

  const uniqueCandidates = new Map<string, (typeof fetched)[number]["candidates"][number]>();
  for (const result of fetched) {
    for (const candidate of result.candidates) {
      if (!uniqueCandidates.has(candidate.canonicalUrl)) uniqueCandidates.set(candidate.canonicalUrl, candidate);
    }
  }
  const candidates = [...uniqueCandidates.values()];
  const inserted = candidates.length
    ? await prisma.article.createMany({
        data: candidates.map((candidate) => ({
          title: candidate.title,
          url: candidate.url,
          canonicalUrl: candidate.canonicalUrl,
          excerpt: candidate.excerpt,
          summary: candidate.summary,
          publishedAt: candidate.publishedAt,
          sourceId: candidate.sourceId,
          processingStatus: "pending",
        })),
        skipDuplicates: true,
      })
    : { count: 0 };

  return {
    sourcesChecked: eligibleSources.length,
    itemsFetched: fetched.reduce((sum, result) => sum + result.itemCount, 0),
    newArticles: inserted.count,
    failedSources: fetched.filter((result) => result.error).map((result) => result.source.title),
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "A briefing request is required" }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const hours = Number(input.hours ?? 24);
  if (!Number.isInteger(hours) || !ALLOWED_HOURS.has(hours)) {
    return NextResponse.json({ error: "Choose a range from 12 hours to 7 days" }, { status: 400 });
  }
  const categories = input.categories ?? [];
  if (!Array.isArray(categories) || categories.length > 20 || categories.some((name) => typeof name !== "string" || name.length > 100)) {
    return NextResponse.json({ error: "Category filter is invalid" }, { status: 400 });
  }

  try {
    const [preferences, configuredSources] = await Promise.all([
      prisma.userPreference.findFirst({ select: { language: true, aiProvider: true, aiModel: true, maxArticlesPerSource: true } }),
      prisma.source.findMany({
        where: categories.length ? { category: { name: { in: categories as string[] } } } : undefined,
        include: { category: { select: { name: true } } },
        orderBy: [{ category: { name: "asc" } }, { title: "asc" }],
      }),
    ]);
    const refresh = await fetchSelectedSources(
      configuredSources as BriefingSource[],
      Math.min(MAX_FEED_ARTICLES, preferences?.maxArticlesPerSource || Number(process.env.MAX_ARTICLES_PER_RUN) || 50),
    );

    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    const articles = await prisma.article.findMany({
      where: {
        publishedAt: { gte: cutoff },
        ...(categories.length ? { source: { category: { name: { in: categories as string[] } } } } : {}),
      },
      orderBy: [{ relevanceScore: "desc" }, { publishedAt: "desc" }],
      take: MAX_BRIEFING_ARTICLES,
      select: {
        id: true,
        title: true,
        url: true,
        canonicalUrl: true,
        excerpt: true,
        summary: true,
        aiSummary: true,
        publishedAt: true,
        relevanceScore: true,
        tags: true,
        source: { select: { title: true, category: { select: { name: true } } } },
      },
    });
    if (articles.length === 0) {
      return NextResponse.json({ data: [], scanned: 0, hours, refresh });
    }

    const inputs: BatchArticleInput[] = articles.map((article) => ({
      canonicalUrl: article.canonicalUrl,
      title: article.title,
      publisher: article.source.title,
      publishedAt: article.publishedAt?.toISOString() ?? null,
      excerpt: article.excerpt || article.summary || article.aiSummary || null,
      category: article.source.category.name,
    }));
    const prepared = prepareArticleBatches(inputs, {
      maxArticles: 15,
      maxInputChars: 20_000,
      maxExcerptChars: 1_200,
    });
    const provider = providerSelection(preferences);
    const batches = prepared.batches.slice(0, 4);
    const responses = await mapWithConcurrency(batches, 2, (batch) =>
      summarizeBatch(batch, preferences?.language || process.env.DEFAULT_LANGUAGE || "vi", provider)
    );
    const summaries = new Map(
      responses.flatMap((response) => response?.results.map((result) => [result.canonicalUrl, result] as const) ?? [])
    );
    const data = articles.flatMap((article) => {
      const summary = summaries.get(article.canonicalUrl);
      if (!summary) return [];
      return [{
        id: article.id,
        title: article.title,
        url: article.url,
        publisher: article.source.title,
        category: article.source.category.name,
        publishedAt: article.publishedAt,
        summary: summary.summary,
        relevanceScore: summary.relevanceScore,
        relevanceExplanation: summary.relevanceExplanation,
        impact: briefingImpact(summary.relevanceScore),
        tags: summary.tags,
      }];
    });
    if (data.length === 0) {
      return NextResponse.json({
        error: `AI provider ${provider.provider || "configured"} could not summarize the fetched articles. Check provider credentials, model access, or rate limits.`,
        refresh,
        scanned: articles.length,
      }, { status: 502 });
    }
    return NextResponse.json({
      data,
      scanned: articles.length,
      summarized: data.length,
      hours,
      refresh,
      truncated: articles.length > batches.reduce((sum, batch) => sum + batch.length, 0) || prepared.skipped.length > 0,
      provider: responses.find((response) => response)?.provider ?? null,
      model: responses.find((response) => response)?.model ?? null,
    });
  } catch (error) {
    console.error("Daily briefing generation failed:", error);
    return NextResponse.json({ error: "Could not fetch feeds or generate the daily briefing" }, { status: 500 });
  }
}
