import { NextResponse } from "next/server";
import { authenticatedUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { userId, response } = await authenticatedUser();
  if (response) return response;
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const language = url.searchParams.get("language")?.trim().slice(0, 40) ?? "";
  const sort = url.searchParams.get("sort");
  const orderBy = sort === "updated" ? { upstreamUpdatedAt: "desc" as const } : sort === "name" ? { fullName: "asc" as const } : { stars: "desc" as const };
  const projects = await prisma.project.findMany({
    where: { userId, ...(query ? { OR: [{ fullName: { contains: query, mode: "insensitive" as const } }, { description: { contains: query, mode: "insensitive" as const } }] } : {}), ...(language ? { language: { equals: language, mode: "insensitive" as const } } : {}) },
    orderBy,
    take: 100,
    include: { metricSnapshots: { orderBy: { capturedAt: "desc" }, take: 1 }, connectorConfig: { select: { name: true } } },
  });
  const languages = await prisma.project.findMany({ where: { userId, language: { not: null } }, distinct: ["language"], select: { language: true }, orderBy: { language: "asc" } });
  return NextResponse.json({ data: projects, languages: languages.map((item) => item.language).filter(Boolean) });
}
