CREATE TABLE "ConnectorConfig" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "config" JSONB NOT NULL,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConnectorConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Project" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "connectorConfigId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "canonicalUrl" TEXT NOT NULL,
  "owner" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "description" TEXT,
  "language" TEXT,
  "stars" INTEGER NOT NULL DEFAULT 0,
  "forks" INTEGER NOT NULL DEFAULT 0,
  "topics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "upstreamCreatedAt" TIMESTAMP(3),
  "upstreamUpdatedAt" TIMESTAMP(3),
  "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectMetricSnapshot" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "capturedAt" DATE NOT NULL,
  "stars" INTEGER NOT NULL,
  "forks" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectMetricSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConnectorSyncRun" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "connectorConfigId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "fetchedCount" INTEGER NOT NULL DEFAULT 0,
  "insertedCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  CONSTRAINT "ConnectorSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConnectorConfig_userId_type_idx" ON "ConnectorConfig"("userId", "type");
CREATE INDEX "ConnectorConfig_userId_enabled_idx" ON "ConnectorConfig"("userId", "enabled");
CREATE UNIQUE INDEX "Project_connectorConfigId_externalId_key" ON "Project"("connectorConfigId", "externalId");
CREATE INDEX "Project_userId_stars_idx" ON "Project"("userId", "stars");
CREATE INDEX "Project_userId_upstreamUpdatedAt_idx" ON "Project"("userId", "upstreamUpdatedAt");
CREATE INDEX "Project_userId_language_idx" ON "Project"("userId", "language");
CREATE UNIQUE INDEX "ProjectMetricSnapshot_projectId_capturedAt_key" ON "ProjectMetricSnapshot"("projectId", "capturedAt");
CREATE INDEX "ProjectMetricSnapshot_projectId_capturedAt_idx" ON "ProjectMetricSnapshot"("projectId", "capturedAt");
CREATE INDEX "ConnectorSyncRun_userId_startedAt_idx" ON "ConnectorSyncRun"("userId", "startedAt");
CREATE INDEX "ConnectorSyncRun_connectorConfigId_startedAt_idx" ON "ConnectorSyncRun"("connectorConfigId", "startedAt");

ALTER TABLE "ConnectorConfig" ADD CONSTRAINT "ConnectorConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_connectorConfigId_fkey" FOREIGN KEY ("connectorConfigId") REFERENCES "ConnectorConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectMetricSnapshot" ADD CONSTRAINT "ProjectMetricSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConnectorSyncRun" ADD CONSTRAINT "ConnectorSyncRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConnectorSyncRun" ADD CONSTRAINT "ConnectorSyncRun_connectorConfigId_fkey" FOREIGN KEY ("connectorConfigId") REFERENCES "ConnectorConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
