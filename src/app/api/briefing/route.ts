import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { summarizeBatch, type AIProviderSelection, type BatchArticleInput } from "@/lib/aiProvider";
import { mapWithConcurrency, prepareArticleBatches } from "@/lib/batchProcessing";
import { briefingImpact } from "@/lib/briefing";
import { resolveAIModel } from "@/lib/preferences";

const ALLOWED_HOURS = new Set([12, 24, 48, 72, 168]);
const MAX_BRIEFING_ARTICLES = 50;

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
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    const articles = await prisma.article.findMany({
      where: {
        publishedAt: { gte: cutoff },
        ...(categories.length ? { source: { category: { name: { in: categories } } } } : {}),
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
    if (articles.length === 0) return NextResponse.json({ data: [], scanned: 0, hours });

    const inputById = new Map<string, BatchArticleInput>();
    for (const article of articles) {
      inputById.set(article.canonicalUrl, {
        canonicalUrl: article.canonicalUrl,
        title: article.title,
        publisher: article.source.title,
        publishedAt: article.publishedAt?.toISOString() ?? null,
        excerpt: article.excerpt || article.summary || article.aiSummary || null,
        category: article.source.category.name,
      });
    }
    const prepared = prepareArticleBatches([...inputById.values()], {
      maxArticles: 15,
      maxInputChars: 20_000,
      maxExcerptChars: 1_200,
    });
    const preferences = await prisma.userPreference.findFirst({
      select: { language: true, aiProvider: true, aiModel: true },
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
      const score = summary.relevanceScore;
      return [{
        id: article.id,
        title: article.title,
        url: article.url,
        publisher: article.source.title,
        category: article.source.category.name,
        publishedAt: article.publishedAt,
        summary: summary.summary,
        relevanceScore: score,
        relevanceExplanation: summary.relevanceExplanation,
        impact: briefingImpact(score),
        tags: summary.tags,
      }];
    });
    if (data.length === 0) {
      return NextResponse.json({ error: "AI providers could not generate the briefing" }, { status: 502 });
    }
    return NextResponse.json({
      data,
      scanned: articles.length,
      summarized: data.length,
      hours,
      truncated: articles.length > batches.reduce((sum, batch) => sum + batch.length, 0) || prepared.skipped.length > 0,
      provider: responses.find((response) => response)?.provider ?? null,
    });
  } catch (error) {
    console.error("Daily briefing generation failed:", error);
    return NextResponse.json({ error: "Could not generate the daily briefing" }, { status: 500 });
  }
}
