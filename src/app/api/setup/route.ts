import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { validateCredentials } from "@/lib/authValidation";

export async function GET() {
  try {
    const count = await prisma.user.count();
    return NextResponse.json({ data: { needsSetup: count === 0 } });
  } catch {
    return NextResponse.json({ data: { needsSetup: false, dbError: true } }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const validation = validateCredentials(body as Record<string, unknown>);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
  const { username, password } = validation;
  try {
    const user = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`LOCK TABLE "User" IN EXCLUSIVE MODE`;
      if (await tx.user.count()) return null;
      const created = await tx.user.create({ data: { username, passwordHash: await hash(password, 12), role: "admin" } });
      // Claim the pre-authentication single-user installation for its first owner.
      await tx.category.updateMany({ where: { userId: null }, data: { userId: created.id } });
      await tx.source.updateMany({ where: { userId: null }, data: { userId: created.id } });
      await tx.ingestionRun.updateMany({ where: { userId: null }, data: { userId: created.id } });
      await tx.userPreference.updateMany({ where: { userId: null }, data: { userId: created.id } });
      return created;
    }, { maxWait: 15_000, timeout: 30_000 });
    if (!user) return NextResponse.json({ error: "Setup has already been completed" }, { status: 409 });
    return NextResponse.json({ data: { username: user.username } }, { status: 201 });
  } catch (error) {
    console.error("Initial setup failed:", error);
    return NextResponse.json({ error: "Setup failed" }, { status: 500 });
  }
}
