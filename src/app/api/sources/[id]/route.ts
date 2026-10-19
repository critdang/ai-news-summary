import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidSourceArticleLimit } from "@/lib/sourceLimits";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body) || !("maxArticlesPerRun" in body)) {
    return NextResponse.json({ error: "maxArticlesPerRun is required" }, { status: 400 });
  }

  const value = (body as { maxArticlesPerRun: unknown }).maxArticlesPerRun;
  if (!isValidSourceArticleLimit(value)) {
    return NextResponse.json(
      { error: "Per-feed limit must be blank to inherit or a whole number from 1 to 50" },
      { status: 400 }
    );
  }

  try {
    const { id } = await context.params;
    const [preferences, sources] = await Promise.all([
      prisma.userPreference.findFirst({ select: { maxArticlesPerSource: true } }),
      prisma.source.findMany({ select: { id: true, maxArticlesPerRun: true } }),
    ]);
    const totalLimit = preferences?.maxArticlesPerSource
      ?? (Number(process.env.MAX_ARTICLES_PER_RUN || process.env.MAX_ARTICLES_PER_SOURCE) || 50);
    const otherExplicitLimits = sources
      .filter((source) => source.id !== id)
      .reduce((total, source) => total + (source.maxArticlesPerRun ?? 0), 0);
    if (value !== null && otherExplicitLimits + value > totalLimit) {
      return NextResponse.json(
        { error: `Per-feed allocations cannot exceed the total budget of ${totalLimit}. Lower another feed's allocation first.` },
        { status: 400 }
      );
    }

    const source = await prisma.source.update({
      where: { id },
      data: { maxArticlesPerRun: value as number | null },
      select: { id: true, maxArticlesPerRun: true },
    });
    return NextResponse.json({ data: source });
  } catch (error) {
    console.error("Failed to update source limit:", error);
    return NextResponse.json({ error: "Failed to update source limit" }, { status: 500 });
  }
}
