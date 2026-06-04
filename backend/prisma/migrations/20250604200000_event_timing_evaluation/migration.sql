-- NewsItem: ForexFactory event timing fields
ALTER TABLE "NewsItem" ADD COLUMN IF NOT EXISTS "idApi" TEXT;
ALTER TABLE "NewsItem" ADD COLUMN IF NOT EXISTS "dateline" INTEGER;
ALTER TABLE "NewsItem" ADD COLUMN IF NOT EXISTS "eventStartAt" TIMESTAMP(3);
ALTER TABLE "NewsItem" ADD COLUMN IF NOT EXISTS "eventEndAt" TIMESTAMP(3);
ALTER TABLE "NewsItem" ADD COLUMN IF NOT EXISTS "impactValue" INTEGER;
ALTER TABLE "NewsItem" ADD COLUMN IF NOT EXISTS "forecast" TEXT;
ALTER TABLE "NewsItem" ADD COLUMN IF NOT EXISTS "previous" TEXT;
ALTER TABLE "NewsItem" ADD COLUMN IF NOT EXISTS "eventTime" TEXT;
ALTER TABLE "NewsItem" ADD COLUMN IF NOT EXISTS "eventDate" TEXT;

CREATE INDEX IF NOT EXISTS "NewsItem_eventStartAt_idx" ON "NewsItem"("eventStartAt");
CREATE UNIQUE INDEX IF NOT EXISTS "NewsItem_idApi_key" ON "NewsItem"("idApi");

UPDATE "NewsItem" SET "eventStartAt" = "publishedAt" WHERE "eventStartAt" IS NULL;

-- Prediction: event window + event prices
ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "eventStartAt" TIMESTAMP(3);
ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "eventEndAt" TIMESTAMP(3);
ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "priceAtEventStart" DOUBLE PRECISION;
ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "priceAtEventEnd" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "Prediction_eventEndAt_idx" ON "Prediction"("eventEndAt");

-- PredictionResult: extended scoring
ALTER TABLE "PredictionResult" ADD COLUMN IF NOT EXISTS "directionCorrect" BOOLEAN;
ALTER TABLE "PredictionResult" ADD COLUMN IF NOT EXISTS "moveAccuracyPercent" DOUBLE PRECISION;
ALTER TABLE "PredictionResult" ADD COLUMN IF NOT EXISTS "finalScore" DOUBLE PRECISION;
ALTER TABLE "PredictionResult" ADD COLUMN IF NOT EXISTS "baselineSource" TEXT;
