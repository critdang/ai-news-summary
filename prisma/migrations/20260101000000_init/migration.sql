-- Init migration for AI News Summary (single-user, serverless schema).
-- Adapted from Feed2040 (MIT, https://github.com/0xhav0c/Feed2040).
-- Multi-user / next-auth / pgvector / Telegram tables removed for MVP.

-- CreateEnum (not needed in pure SQL; handled by Prisma)

-- CreateTable: Source
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "lastFetched" TIMESTAMP(3),
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "fetchError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Category
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Article
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "excerpt" TEXT,
    "summary" TEXT,
    "aiSummary" TEXT,
    "relevanceScore" DOUBLE PRECISION,
    "relevanceExplanation" TEXT,
    "processingStatus" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceId" TEXT NOT NULL,
    "tags" TEXT[] NOT NULL DEFAULT '{}',
    "bookmarked" BOOLEAN NOT NULL DEFAULT false,
    "bookmarkNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable: IngestionRun
CREATE TABLE "IngestionRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "articleCount" INTEGER NOT NULL DEFAULT 0,
    "newCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "sourcesProcessed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "IngestionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable: FeedHealth
CREATE TABLE "FeedHealth" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastSuccess" TIMESTAMP(3),
    "lastError" TEXT,
    "lastChecked" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedHealth_pkey" PRIMARY KEY ("id")
);

-- CreateTable: UserPreference
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'vi',
    "retentionDays" INTEGER NOT NULL DEFAULT 45,
    "aiProvider" TEXT NOT NULL DEFAULT 'gemini',
    "aiModel" TEXT NOT NULL DEFAULT 'gemini-1.5-flash',
    "maxArticlesPerSource" INTEGER NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Source_url_key" ON "Source"("url");

-- CreateIndex
CREATE INDEX "Source_categoryId_idx" ON "Source"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_slug_idx" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Article_sourceId_idx" ON "Article"("sourceId");

-- CreateIndex
CREATE INDEX "Article_publishedAt_idx" ON "Article"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Article_canonicalUrl_key" ON "Article"("canonicalUrl");

-- CreateIndex
CREATE INDEX "Article_bookmarked_idx" ON "Article"("bookmarked");

-- CreateIndex
CREATE INDEX "Article_relevanceScore_idx" ON "Article"("relevanceScore");

-- CreateIndex
CREATE INDEX "IngestionRun_status_idx" ON "IngestionRun"("status");

-- CreateIndex
CREATE INDEX "IngestionRun_startedAt_idx" ON "IngestionRun"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedHealth_sourceId_key" ON "FeedHealth"("sourceId");

-- CreateIndex
CREATE INDEX "FeedHealth_sourceId_idx" ON "FeedHealth"("sourceId");

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedHealth" ADD CONSTRAINT "FeedHealth_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT;
