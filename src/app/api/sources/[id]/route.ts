import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidSourceArticleLimit } from "@/lib/sourceLimits";
import { authenticatedUser } from "@/lib/api-auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { userId, response } = await authenticatedUser();
  if (!userId) return response!;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid source update" }, { status: 400 });
  }
  const payload = body as { maxArticlesPerRun?: unknown; categoryId?: unknown };
  if (!("maxArticlesPerRun" in payload) && !("categoryId" in payload)) {
    return NextResponse.json({ error: "A source field is required" }, { status: 400 });
  }
  const value = payload.maxArticlesPerRun;
  if ("maxArticlesPerRun" in payload && !isValidSourceArticleLimit(value)) {
    return NextResponse.json(
      { error: "Per-feed limit must be blank to inherit or a whole number from 1 to 50" },
      { status: 400 }
    );
  }

  try {
    const { id } = await context.params;
    let categoryId: string | undefined;
    if ("categoryId" in payload) {
      if (typeof payload.categoryId !== "string") {
        return NextResponse.json({ error: "Choose a valid folder" }, { status: 400 });
      }
      const category = await prisma.category.findFirst({ where: { id: payload.categoryId, userId }, select: { id: true } });
      if (!category) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
      categoryId = category.id;
    }
    const [preferences, sources] = await Promise.all([
      prisma.userPreference.findUnique({ where: { userId }, select: { maxArticlesPerSource: true } }),
      prisma.source.findMany({ where: { userId }, select: { id: true, maxArticlesPerRun: true } }),
    ]);
    const totalLimit = preferences?.maxArticlesPerSource
      ?? (Number(process.env.MAX_ARTICLES_PER_RUN || process.env.MAX_ARTICLES_PER_SOURCE) || 50);
    const otherExplicitLimits = sources
      .filter((source) => source.id !== id)
      .reduce((total, source) => total + (source.maxArticlesPerRun ?? 0), 0);
    if ("maxArticlesPerRun" in payload && value !== null && otherExplicitLimits + (value as number) > totalLimit) {
      return NextResponse.json(
        { error: `Per-feed allocations cannot exceed the total budget of ${totalLimit}. Lower another feed's allocation first.` },
        { status: 400 }
      );
    }

    const source = await prisma.source.updateMany({
      where: { id, userId },
      data: {
        ...( "maxArticlesPerRun" in payload ? { maxArticlesPerRun: value as number | null } : {}),
        ...(categoryId ? { categoryId } : {}),
      },
    });
    if (!source.count) return NextResponse.json({ error: "Source not found" }, { status: 404 });
    return NextResponse.json({ data: await prisma.source.findFirst({ where: { id, userId }, select: { id: true, maxArticlesPerRun: true, categoryId: true } }) });
  } catch (error) {
    console.error("Failed to update source limit:", error);
    return NextResponse.json({ error: "Failed to update source limit" }, { status: 500 });
  }
}
