import { NextResponse } from "next/server";
import { authenticatedUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getConnector } from "@/lib/connectors/registry";
import type { GitHubConnectorConfig } from "@/lib/connectors/github";
import type { GitHubProject } from "@/lib/connectors/types";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { userId, response } = await authenticatedUser();
  if (response) return response;
  const { id } = await context.params;
  const config = await prisma.connectorConfig.findFirst({ where: { id, userId, type: "github-repositories" } });
  if (!config) return NextResponse.json({ error: "Connector not found." }, { status: 404 });
  if (!config.enabled) return NextResponse.json({ error: "Enable this connector before syncing." }, { status: 409 });
  const recentRun = await prisma.connectorSyncRun.findFirst({ where: { connectorConfigId: id, startedAt: { gte: new Date(Date.now() - 30_000) } }, select: { id: true } });
  if (recentRun) return NextResponse.json({ error: "A sync was started recently. Wait a moment and retry." }, { status: 429 });

  const run = await prisma.connectorSyncRun.create({ data: { userId, connectorConfigId: id, status: "running" } });
  try {
    const connector = getConnector(config.type);
    const validatedConfig = connector.validateConfig(config.config) as GitHubConnectorConfig;
    const entities = await connector.fetch(validatedConfig, AbortSignal.timeout(10_000)) as GitHubProject[];
    const syncedAt = new Date();
    const capturedAt = new Date(Date.UTC(syncedAt.getUTCFullYear(), syncedAt.getUTCMonth(), syncedAt.getUTCDate()));
    const prior = await prisma.project.findMany({
      where: { connectorConfigId: id, externalId: { in: entities.map((entity) => entity.externalId) } },
      select: { externalId: true },
    });
    const existingIds = new Set(prior.map((project) => project.externalId));
    await prisma.$transaction(async (tx) => {
      for (const entity of entities) {
        const project = await tx.project.upsert({
          where: { connectorConfigId_externalId: { connectorConfigId: id, externalId: entity.externalId } },
          create: { ...entity, userId, connectorConfigId: id, lastSyncedAt: syncedAt },
          update: { ...entity, lastSyncedAt: syncedAt },
          select: { id: true },
        });
        await tx.projectMetricSnapshot.upsert({
          where: { projectId_capturedAt: { projectId: project.id, capturedAt } },
          create: { projectId: project.id, capturedAt, stars: entity.stars, forks: entity.forks },
          update: { stars: entity.stars, forks: entity.forks },
        });
      }
      await tx.connectorConfig.update({ where: { id }, data: { lastSyncedAt: syncedAt } });
      await tx.connectorSyncRun.update({
        where: { id: run.id },
        data: { status: "completed", completedAt: syncedAt, fetchedCount: entities.length, insertedCount: entities.filter((entity) => !existingIds.has(entity.externalId)).length, updatedCount: entities.filter((entity) => existingIds.has(entity.externalId)).length },
      });
    });
    return NextResponse.json({ data: { runId: run.id, fetched: entities.length, inserted: entities.filter((entity) => !existingIds.has(entity.externalId)).length, updated: entities.filter((entity) => existingIds.has(entity.externalId)).length } });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "GitHub sync failed.";
    await prisma.connectorSyncRun.update({ where: { id: run.id }, data: { status: "failed", completedAt: new Date(), errorMessage: message } });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
