-- Allow Settings to choose the cadence for scheduled RSS collection.
ALTER TABLE "UserPreference"
ADD COLUMN "ingestionIntervalHours" INTEGER NOT NULL DEFAULT 12;

ALTER TABLE "IngestionRun"
ADD COLUMN "scheduled" BOOLEAN NOT NULL DEFAULT false;
