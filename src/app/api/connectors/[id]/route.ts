import { NextResponse } from "next/server";
import { authenticatedUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { githubConfigSchema } from "@/lib/connectors/github";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { userId, response } = await authenticatedUser();
  if (response) return response;
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const data: { name?: string; enabled?: boolean; config?: object } = {};
  if (typeof body?.name === "string") {
    const name = body.name.trim().slice(0, 80);
    if (!name) return NextResponse.json({ error: "Connector name is required." }, { status: 400 });
    data.name = name;
  }
  if (typeof body?.enabled === "boolean") data.enabled = body.enabled;
  if (body && Object.hasOwn(body, "config")) {
    const parsed = githubConfigSchema.safeParse(body.config);
    if (!parsed.success) return NextResponse.json({ error: "Invalid GitHub search settings." }, { status: 400 });
    data.config = parsed.data;
  }
  const result = await prisma.connectorConfig.updateMany({ where: { id, userId, type: "github-repositories" }, data });
  if (!result.count) return NextResponse.json({ error: "Connector not found." }, { status: 404 });
  const connector = await prisma.connectorConfig.findFirst({ where: { id, userId } });
  return NextResponse.json({ data: connector });
}

export async function DELETE(_request: Request, context: Context) {
  const { userId, response } = await authenticatedUser();
  if (response) return response;
  const { id } = await context.params;
  const result = await prisma.connectorConfig.deleteMany({ where: { id, userId } });
  return result.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Connector not found." }, { status: 404 });
}
