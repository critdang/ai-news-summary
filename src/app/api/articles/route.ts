/**
 * src/app/api/articles/route.ts
 *
 * GET /api/articles — list articles with pagination, search, category/bookmark
 * filters and sorting. Single-user: no authentication required.
 *
 * Input validation: page/limit are bounded; search and category are sanitized.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);

    const page = Math.max(
      1,
      parseInt(searchParams.get("page") || "1", 10)
    );
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10))
    );
    const skip = (page - 1) * limit;

    const search = searchParams.get("q")?.trim() || "";
    const category = searchParams.get("category")?.trim() || "";
    const bookmarked = searchParams.get("bookmarked");
    const status = searchParams.get("status")?.trim() || ""; // completed|failed|pending
    const sort = searchParams.get("sort") || "publishedAt"; // publishedAt|createdAt|relevanceScore
    const order = searchParams.get("order") || "desc";

    // Build where clause.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { excerpt: { contains: search, mode: "insensitive" } },
        { aiSummary: { contains: search, mode: "insensitive" } },
        { source: { title: { contains: search, mode: "insensitive" } } },
      ];
    }

    if (category) {
      where.source = { category: { name: category } };
    }

    if (bookmarked === "1") {
      where.bookmarked = true;
    } else if (bookmarked === "0") {
      where.bookmarked = false;
    }

    if (status) {
      where.processingStatus = status;
    }

    // Validate sort field to prevent ordering by arbitrary columns.
    const allowedSorts = ["publishedAt", "createdAt", "relevanceScore", "title"];
    const sortField = allowedSorts.includes(sort) ? sort : "publishedAt";
    const sortOrder = order === "asc" ? "asc" : "desc";

    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where,
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
        orderBy: { [sortField]: sortOrder },
        skip,
        take: limit,
      }),
      prisma.article.count({ where }),
    ]);

    const formatted = articles.map((a) => ({
      id: a.id,
      title: a.title,
      url: a.url,
      canonicalUrl: a.canonicalUrl,
      excerpt: a.excerpt,
      summary: a.summary,
      aiSummary: a.aiSummary,
      relevanceScore: a.relevanceScore,
      relevanceExplanation: a.relevanceExplanation,
      processingStatus: a.processingStatus,
      publishedAt: a.publishedAt,
      firstSeenAt: a.firstSeenAt,
      source: a.source
        ? { ...a.source, category: a.source.category.name }
        : null,
      tags: a.tags,
      bookmarked: a.bookmarked,
      bookmarkNote: a.bookmarkNote,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }));

    return NextResponse.json({
      data: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Failed to fetch articles:", error);
    return NextResponse.json(
      { error: "Failed to fetch articles" },
      { status: 500 }
    );
  }
}
