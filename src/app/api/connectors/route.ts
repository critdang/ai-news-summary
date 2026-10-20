import { NextResponse } from "next/server";
import { authenticatedUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { githubConfigSchema } from "@/lib/connectors/github";

export const runtime = "nodejs";

export async function GET() {
  const { userId, response } = await authenticatedUser();
  if (response) return response;
  const connectors = await prisma.connectorConfig.findMany({
    where: { userId },
    include: { runs: { orderBy: { startedAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ data: connectors.map(({ config, runs, ...connector }) => ({ ...connector, config, lastRun: runs[0] ?? null })) });
}

export async function POST(request: Request) {
  const { userId, response } = await authenticatedUser();
  if (response) return response;
  const body = await request.json().catch(() => null);
  const parsed = githubConfigSchema.safeParse(body?.config);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "GitHub discovery";
  if (!parsed.success || !name) return NextResponse.json({ error: "Enter a valid GitHub connector configuration." }, { status: 400 });
  const connector = await prisma.connectorConfig.create({
    data: { userId, type: "github-repositories", version: 1, name, config: parsed.data },
  });
  return NextResponse.json({ data: connector }, { status: 201 });
}
