import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validatePreferencesInput } from "@/lib/preferences";

const DEFAULT_PREFERENCES = {
  language: process.env.DEFAULT_LANGUAGE || "vi",
  retentionDays: 45,
  maxArticlesPerSource: Number(process.env.MAX_ARTICLES_PER_SOURCE) || 20,
};

export async function GET(): Promise<NextResponse> {
  try {
    const saved = await prisma.userPreference.findFirst({
      select: { language: true, retentionDays: true, maxArticlesPerSource: true },
    });
    return NextResponse.json({ data: saved ?? DEFAULT_PREFERENCES });
  } catch (error) {
    console.error("Failed to fetch preferences:", error);
    return NextResponse.json({ error: "Failed to fetch preferences" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const validation = validatePreferencesInput(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const current = await prisma.userPreference.findFirst({ select: { id: true } });
    const data = validation.value;
    const saved = current
      ? await prisma.userPreference.update({ where: { id: current.id }, data })
      : await prisma.userPreference.create({ data });
    return NextResponse.json({
      data: {
        language: saved.language,
        retentionDays: saved.retentionDays,
        maxArticlesPerSource: saved.maxArticlesPerSource,
      },
    });
  } catch (error) {
    console.error("Failed to save preferences:", error);
    return NextResponse.json({ error: "Failed to save preferences" }, { status: 500 });
  }
}
