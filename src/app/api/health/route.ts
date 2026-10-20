/**
 * src/app/api/health/route.ts
 *
 * GET /api/health — feed health summary (consecutive failures, last success).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticatedUser } from "@/lib/api-auth";

export async function GET(): Promise<NextResponse> {
  try {
    const { userId, response } = await authenticatedUser();
    if (!userId) return response!;
    const health = await prisma.feedHealth.findMany({
      where: { source: { userId } },
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
      orderBy: { lastChecked: "desc" },
    });

    const healthy = health.filter((h) => h.consecutiveFailures === 0).length;
    const errors = health.filter((h) => h.consecutiveFailures > 0).length;

    return NextResponse.json({
      data: health.map(({ source, ...item }) => ({
        ...item,
        source: { ...source, category: source.category.name },
      })),
      summary: { healthy, errors },
    });
  } catch (error) {
    console.error("Failed to fetch health:", error);
    return NextResponse.json({ error: "Failed to fetch health" }, { status: 500 });
  }
}
