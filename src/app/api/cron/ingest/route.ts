import { NextRequest, NextResponse } from "next/server";
import { runIngestion } from "../../../../../scripts/ingest";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await runIngestion({ scheduled: true });
    return NextResponse.json({ status: "completed" });
  } catch (error) {
    console.error("Scheduled ingestion failed:", error);
    return NextResponse.json({ error: "Scheduled ingestion failed" }, { status: 500 });
  }
}