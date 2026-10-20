import { NextResponse } from "next/server";
import { requireUserId } from "@/auth";

export async function authenticatedUser() {
  const userId = await requireUserId();
  if (!userId) return { userId: null, response: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  return { userId, response: null };
}
