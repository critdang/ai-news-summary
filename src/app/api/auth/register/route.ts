import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { validateCredentials } from "@/lib/authValidation";

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const validation = validateCredentials(body as Record<string, unknown>);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
  const { username, password } = validation;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`LOCK TABLE "User" IN EXCLUSIVE MODE`;
      if (!(await tx.user.count())) throw new Error("INITIAL_SETUP_REQUIRED");
      await tx.user.create({ data: { username, passwordHash: await hash(password, 12) } });
    }, { maxWait: 15_000, timeout: 30_000 });
    return NextResponse.json({ data: { username } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "INITIAL_SETUP_REQUIRED") return NextResponse.json({ error: "Create the initial administrator at /setup first" }, { status: 409 });
    return NextResponse.json({ error: "Username is already in use" }, { status: 409 });
  }
}
