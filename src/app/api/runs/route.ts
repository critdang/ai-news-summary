/**
 * src/app/api/runs/route.ts
 *
 * GET /api/runs — list ingestion runs (status, counts, timestamps).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(): Promise<NextResponse> {
  try {
    const runs = await prisma.ingestionRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        startedAt: true,
        completedAt: true,
        articleCount: true,
        newCount: true,
        errorCount: true,
        errorMessage: true,
        sourcesProcessed: true,
      },
    });

    const lastSuccess = await prisma.ingestionRun.findFirst({
      where: { status: "completed" },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    });

    return NextResponse.json({
      data: runs,
      lastSuccessfulUpdate: lastSuccess?.completedAt ?? null,
    });
  } catch (error) {
    console.error("Failed to fetch runs:", error);
    return NextResponse.json({ error: "Failed to fetch runs" }, { status: 500 });
  }
}
