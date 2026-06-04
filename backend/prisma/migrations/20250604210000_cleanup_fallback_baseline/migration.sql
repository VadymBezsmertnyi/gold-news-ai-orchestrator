-- Remove evaluation results that used live price as a fake historical baseline.
DELETE FROM "PredictionResult"
WHERE "baselineSource" = 'fallback_current';

-- Re-evaluate SINGLE_NEWS predictions tied to calendar events.
UPDATE "Prediction"
SET
  "status" = 'PENDING',
  "priceAtEventStart" = NULL,
  "priceAtEventEnd" = NULL,
  "invalidationReason" = NULL
WHERE "sourceType" = 'SINGLE_NEWS'
  AND "eventStartAt" IS NOT NULL;
