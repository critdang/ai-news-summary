import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { categorySlug } from "@/lib/categoryUtils";
import { authenticatedUser } from "@/lib/api-auth";

export async function GET(): Promise<NextResponse> {
  try {
    const { userId, response } = await authenticatedUser();
    if (!userId) return response!;
    const categories = await prisma.category.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { sources: true } } },
    });
    return NextResponse.json({ data: categories });
  } catch (error) {
    console.error("Failed to fetch categories:", error);
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { userId, response } = await authenticatedUser();
  if (!userId) return response!;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "A category is required" }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 100) : "";
  const color = typeof input.color === "string" && /^#[0-9a-fA-F]{6}$/.test(input.color) ? input.color : null;
  if (!name) return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
  try {
    const slug = categorySlug(name);
    const category = await prisma.category.upsert({
      where: { userId_slug: { userId, slug } },
      update: { name, ...(color ? { color } : {}) },
      create: { name, slug, color, userId },
    });
    return NextResponse.json({ data: category }, { status: 201 });
  } catch (error) {
    console.error("Failed to create category:", error);
    return NextResponse.json({ error: "Folder name is already in use" }, { status: 409 });
  }
}
