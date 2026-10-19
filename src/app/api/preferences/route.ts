import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveAIModel, validatePreferencesInput } from "@/lib/preferences";

const defaultProvider = process.env.AI_PROVIDER === "gemini" ? "gemini" : process.env.AI_PROVIDER === "mock" ? "mock" : "groq";

const DEFAULT_PREFERENCES = {
  language: process.env.DEFAULT_LANGUAGE || "vi",
  retentionDays: 45,
  maxArticlesPerRun: Number(process.env.MAX_ARTICLES_PER_RUN || process.env.MAX_ARTICLES_PER_SOURCE) || 50,
  aiProvider: defaultProvider,
  aiModel: resolveAIModel(defaultProvider, defaultProvider === "gemini" ? process.env.AI_MODEL : process.env.GROQ_MODEL),
};

export async function GET(): Promise<NextResponse> {
  try {
    const saved = await prisma.userPreference.findFirst({
      select: { language: true, retentionDays: true, maxArticlesPerSource: true, aiProvider: true, aiModel: true },
    });
    return NextResponse.json({
      data: saved
        ? {
            language: saved.language,
            retentionDays: saved.retentionDays,
            maxArticlesPerRun: saved.maxArticlesPerSource,
            aiProvider: saved.aiProvider,
            aiModel: saved.aiModel,
          }
        : DEFAULT_PREFERENCES,
      availableProviders: {
        gemini: Boolean(process.env.GEMINI_API_KEY),
        groq: Boolean(process.env.GROQ_API_KEY),
        mock: true,
      },
    });
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
    const explicitLimits = await prisma.source.aggregate({
      _sum: { maxArticlesPerRun: true },
    });
    const allocated = explicitLimits._sum.maxArticlesPerRun ?? 0;
    if (allocated > validation.value.maxArticlesPerRun) {
      return NextResponse.json(
        { error: `Per-feed allocations total ${allocated}; lower them before setting a smaller global budget.` },
        { status: 400 }
      );
    }

    const current = await prisma.userPreference.findFirst({ select: { id: true, aiProvider: true, aiModel: true } });
    const { maxArticlesPerRun, ...otherData } = validation.value;
    const aiProvider = validation.value.aiProvider ?? current?.aiProvider ?? DEFAULT_PREFERENCES.aiProvider;
    const normalizedProvider = aiProvider === "gemini" || aiProvider === "mock" ? aiProvider : "groq";
    const modelCandidate = validation.value.aiModel ?? (aiProvider === current?.aiProvider ? current?.aiModel : undefined);
    const data = {
      ...otherData,
      aiProvider: normalizedProvider,
      aiModel: resolveAIModel(normalizedProvider, modelCandidate),
      maxArticlesPerSource: maxArticlesPerRun,
    };
    const saved = current
      ? await prisma.userPreference.update({ where: { id: current.id }, data })
      : await prisma.userPreference.create({ data });
    return NextResponse.json({
      data: {
        language: saved.language,
        retentionDays: saved.retentionDays,
        maxArticlesPerRun: saved.maxArticlesPerSource,
        aiProvider: saved.aiProvider,
        aiModel: saved.aiModel,
      },
    });
  } catch (error) {
    console.error("Failed to save preferences:", error);
    return NextResponse.json({ error: "Failed to save preferences" }, { status: 500 });
  }
}
