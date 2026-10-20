import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { categorySlug } from "@/lib/categoryUtils";
import { authenticatedUser } from "@/lib/api-auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { userId, response } = await authenticatedUser();
  if (!userId) return response!;
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Folder updates are required" }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 100) : "";
  const color = typeof input.color === "string" ? input.color : "";
  if (!name) return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
  if (typeof input.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(input.color)) {
    return NextResponse.json({ error: "Choose a valid folder color" }, { status: 400 });
  }
  try {
    const category = await prisma.category.updateMany({
      where: { id, userId },
      data: { name, slug: categorySlug(name), color },
    });
    if (!category.count) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    return NextResponse.json({ data: await prisma.category.findUnique({ where: { id } }) });
  } catch {
    return NextResponse.json({ error: "Folder was not found or its name is already in use" }, { status: 409 });
  }
}
