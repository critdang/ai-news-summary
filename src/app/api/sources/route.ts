/**
 * src/app/api/sources/route.ts
 *
 * GET /api/sources — list sources.
 * POST /api/sources — add a new RSS source (validated against SSRF).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateFeedUrl } from "@/lib/utils/url-validator";
import { categorySlug } from "@/lib/categoryUtils";
import { authenticatedUser } from "@/lib/api-auth";

export async function GET(): Promise<NextResponse> {
  try {
    const { userId, response } = await authenticatedUser();
    if (!userId) return response!;
    const sources = await prisma.source.findMany({
      where: { userId },
      orderBy: [{ category: { name: "asc" } }, { title: "asc" }],
      include: {
        category: { select: { id: true, name: true, color: true } },
        _count: { select: { articles: true } },
        health: true,
      },
    });
    return NextResponse.json({
      data: sources.map(({ category, ...source }) => ({
        ...source,
        category: category.name,
        categoryId: category.id,
        categoryColor: category.color,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch sources:", error);
    return NextResponse.json({ error: "Failed to fetch sources" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId, response } = await authenticatedUser();
    if (!userId) return response!;
    const body = await req.json();
    const { url, title, category } = body as {
      url?: string;
      title?: string;
      category?: string;
    };

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    const validation = validateFeedUrl(url);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error || "Invalid feed URL" },
        { status: 400 }
      );
    }

    const cat = typeof category === "string" ? category.trim().slice(0, 100) : "Uncategorized";
    const sourceUrl = url.trim();
    const sourceTitle = typeof title === "string" && title.trim()
      ? title.trim().slice(0, 200)
      : sourceUrl;

    // Idempotent: if a source with this URL already exists, return it.
    const existing = await prisma.source.findFirst({ where: { url: sourceUrl, userId } });
    if (existing) {
      return NextResponse.json({ data: existing }, { status: 200 });
    }

    const slug = categorySlug(cat);
    const categoryRow = await prisma.category.upsert({
      where: { userId_slug: { userId, slug } },
      update: {},
      create: { name: cat || "Uncategorized", slug, userId, sortOrder: 0 },
    });

    const source = await prisma.source.create({
      data: {
        title: sourceTitle,
        url: sourceUrl,
        categoryId: categoryRow.id,
        userId,
      },
    });

    // Ensure a FeedHealth row exists.
    await prisma.feedHealth.upsert({
      where: { sourceId: source.id },
      update: {},
      create: { sourceId: source.id, consecutiveFailures: 0 },
    });

    return NextResponse.json({ data: source }, { status: 201 });
  } catch (error) {
    console.error("Failed to create source:", error);
    return NextResponse.json(
      { error: "Failed to create source" },
      { status: 500 }
    );
  }
}
