/**
 * src/app/api/articles/[id]/route.ts
 *
 * GET /api/articles/[id] — single article detail.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;

    const article = await prisma.article.findUnique({
      where: { id },
      include: {
        source: {
          select: {
            id: true,
            title: true,
            url: true,
            category: { select: { name: true } },
          },
        },
      },
    });

    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: article.id,
      title: article.title,
      url: article.url,
      canonicalUrl: article.canonicalUrl,
      excerpt: article.excerpt,
      summary: article.summary,
      aiSummary: article.aiSummary,
      relevanceScore: article.relevanceScore,
      relevanceExplanation: article.relevanceExplanation,
      processingStatus: article.processingStatus,
      publishedAt: article.publishedAt,
      firstSeenAt: article.firstSeenAt,
      source: article.source
        ? { ...article.source, category: article.source.category.name }
        : null,
      tags: article.tags,
      bookmarked: article.bookmarked,
      bookmarkNote: article.bookmarkNote,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
    });
  } catch (error) {
    console.error("Failed to fetch article:", error);
    return NextResponse.json({ error: "Failed to fetch article" }, { status: 500 });
  }
}
