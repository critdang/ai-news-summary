/**
 * src/app/api/articles/bookmark/route.ts
 *
 * POST /api/articles/bookmark — toggle bookmark on an article.
 * Body: { articleId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticatedUser } from "@/lib/api-auth";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { userId, response } = await authenticatedUser();
    if (!userId) return response!;
    const body = await req.json();
    const { articleId } = body as { articleId?: string };

    if (!articleId || typeof articleId !== "string") {
      return NextResponse.json({ error: "articleId is required" }, { status: 400 });
    }

    const article = await prisma.article.findFirst({ where: { id: articleId, source: { userId } } });
    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    const bookmarked = !article.bookmarked;
    await prisma.article.updateMany({
      where: { id: articleId, source: { userId } },
      data: { bookmarked },
    });

    return NextResponse.json({ data: { articleId, bookmarked } });
  } catch (error) {
    console.error("Failed to toggle bookmark:", error);
    return NextResponse.json({ error: "Failed to toggle bookmark" }, { status: 500 });
  }
}
