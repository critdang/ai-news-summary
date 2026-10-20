ALTER TABLE "Article"
ADD COLUMN "githubStars" INTEGER,
ADD COLUMN "githubForks" INTEGER,
ADD COLUMN "githubTopics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "UserPreference"
ADD COLUMN "githubEnrichmentEnabled" BOOLEAN NOT NULL DEFAULT true;
