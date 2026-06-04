-- Prompt improvement quality system: candidate → active promotion

CREATE TYPE "PromptImprovementStatus" AS ENUM (
  'CANDIDATE',
  'ACTIVE',
  'REJECTED',
  'DEPRECATED'
);

ALTER TABLE "LearningRule" ADD COLUMN IF NOT EXISTS "status" "PromptImprovementStatus";
ALTER TABLE "LearningRule" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);
ALTER TABLE "LearningRule" ADD COLUMN IF NOT EXISTS "sourcePredictionIds" JSONB;
ALTER TABLE "LearningRule" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
ALTER TABLE "LearningRule" ADD COLUMN IF NOT EXISTS "manualPromote" BOOLEAN NOT NULL DEFAULT false;

UPDATE "LearningRule"
SET "status" = 'DEPRECATED'
WHERE "isDeprecated" = true AND "status" IS NULL;

UPDATE "LearningRule"
SET "status" = 'CANDIDATE'
WHERE "isDeprecated" = false AND "status" IS NULL;

ALTER TABLE "LearningRule" ALTER COLUMN "status" SET DEFAULT 'CANDIDATE';
ALTER TABLE "LearningRule" ALTER COLUMN "status" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "LearningRule_status_lastSeenAt_idx"
  ON "LearningRule"("status", "lastSeenAt");
