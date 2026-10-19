import { NextRequest, NextResponse } from "next/server";
import { runCleanup } from "../../../../../scripts/cleanup";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await runCleanup(["--apply"]);
    return NextResponse.json({ status: "completed" });
  } catch (error) {
    console.error("Scheduled cleanup failed:", error);
    return NextResponse.json({ error: "Scheduled cleanup failed" }, { status: 500 });
  }
}