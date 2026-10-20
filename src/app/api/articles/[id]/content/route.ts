import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticatedUser } from "@/lib/api-auth";
import { scrapeFullText } from "@/lib/rss/scraper";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { userId, response } = await authenticatedUser();
  if (!userId) return response!;
  try {
    const { id } = await params;
    const article = await prisma.article.findFirst({
      where: { id, source: { userId } },
      select: { url: true },
    });
    if (!article) return NextResponse.json({ error: "Article not found" }, { status: 404 });
    const content = await scrapeFullText(article.url);
    return NextResponse.json({ data: { content } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Failed to extract article content:", error);
    return NextResponse.json({ error: "Could not load readable article content" }, { status: 502 });
  }
}
