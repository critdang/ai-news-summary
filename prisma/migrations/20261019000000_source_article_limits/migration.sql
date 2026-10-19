-- Optional per-feed ingestion limit. NULL inherits UserPreference.maxArticlesPerSource.
ALTER TABLE "Source" ADD COLUMN "maxArticlesPerRun" INTEGER;
