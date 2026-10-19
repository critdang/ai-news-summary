import { after, NextRequest, NextResponse } from "next/server";
import { runIngestion } from "../../../../../scripts/ingest";

export const runtime = "nodejs";
export const maxDuration = 300;
const recentRequests = new Map<string, number>();

function originIsSameSite(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!originIsSameSite(request)) {
    return NextResponse.json({ error: "Request must come from this site" }, { status: 403 });
  }

  const now = Date.now();
  const key = request.headers.get("x-forwarded-for") || "default";
  const previous = recentRequests.get(key) ?? 0;
  if (now - previous < 60_000) {
    return NextResponse.json({ error: "Please wait a minute before starting another RSS update." }, { status: 429 });
  }

  recentRequests.set(key, now);
  after(async () => {
    try {
      await runIngestion({ scheduled: false });
    } catch (error) {
      console.error("Manual ingestion failed:", error);
    }
  });

  return NextResponse.json({
    requestedAt: new Date(Math.floor(now / 1000) * 1000).toISOString(),
    status: "queued",
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const since = request.nextUrl.searchParams.get("since");
  const requestedAt = since ? Date.parse(since) : Number.NaN;
  if (!Number.isFinite(requestedAt) || Math.abs(Date.now() - requestedAt) > 15 * 60_000) {
    return NextResponse.json({ error: "A recent ingestion request timestamp is required." }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");
  const run = await prisma.ingestionRun.findFirst({
    where: { scheduled: false, startedAt: { gte: new Date(requestedAt) } },
    orderBy: { startedAt: "asc" },
    select: { status: true, completedAt: true, errorMessage: true },
  });
  if (!run) return NextResponse.json({ status: "queued" });

  return NextResponse.json({
    status: run.completedAt ? "completed" : run.status,
    conclusion: run.status === "failed" ? "failure" : run.status === "partial" ? "partial" : "success",
    error: run.errorMessage,
  });
}