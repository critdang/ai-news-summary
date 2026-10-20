import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { summarizeArticle, type AIProviderSelection } from "@/lib/aiProvider";
import { resolveAIModel } from "@/lib/preferences";
import { authenticatedUser } from "@/lib/api-auth";
import { getUserProviderKeys } from "@/lib/providerCredentials";

function selectionForPreference(
  preference: { aiProvider: string; aiModel: string } | null
): AIProviderSelection {
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

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { userId, response } = await authenticatedUser();
    if (!userId) return response!;
    const { id } = await params;
    const article = await prisma.article.findUnique({
      where: { id, source: { userId } },
      select: { id: true, title: true, excerpt: true, summary: true, aiSummary: true },
    });
    if (!article) return NextResponse.json({ error: "Article not found" }, { status: 404 });
    if (article.aiSummary) return NextResponse.json({ data: { summary: article.aiSummary, cached: true } });

    const preference = await prisma.userPreference.findUnique({ where: { userId },
      select: { language: true, aiProvider: true, aiModel: true },
    });
    const apiKeys = await getUserProviderKeys(userId);
    const outcome = await summarizeArticle(
      article.title,
      article.excerpt || article.summary || null,
      preference?.language || process.env.DEFAULT_LANGUAGE || "vi",
      { ...selectionForPreference(preference), apiKeys }
    );
    if (!outcome) return NextResponse.json({ error: "AI providers could not summarize this article" }, { status: 502 });

    const saved = await prisma.article.updateMany({
      where: { id: article.id, aiSummary: null, source: { userId } },
      data: {
        aiSummary: outcome.result.summary,
        relevanceScore: outcome.result.relevanceScore,
        relevanceExplanation: outcome.result.relevanceExplanation,
        tags: outcome.result.tags,
        processingStatus: "completed",
      },
    });
    if (!saved.count) {
      const latest = await prisma.article.findFirst({ where: { id, source: { userId } }, select: { aiSummary: true } });
      return NextResponse.json({ data: { summary: latest?.aiSummary ?? outcome.result.summary, cached: true } });
    }
    return NextResponse.json({
      data: {
        summary: outcome.result.summary,
        relevanceScore: outcome.result.relevanceScore,
        relevanceExplanation: outcome.result.relevanceExplanation,
        tags: outcome.result.tags,
        provider: outcome.provider,
        cached: false,
      },
    });
  } catch (error) {
    console.error("On-demand article summarization failed:", error);
    return NextResponse.json({ error: "Could not summarize article" }, { status: 500 });
  }
}
