-- Prompt improvement engine: quality metrics + prediction attribution
ALTER TABLE "LearningRule" ADD COLUMN IF NOT EXISTS "occurrences" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "LearningRule" ADD COLUMN IF NOT EXISTS "usageCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LearningRule" ADD COLUMN IF NOT EXISTS "timesApplied" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LearningRule" ADD COLUMN IF NOT EXISTS "successCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LearningRule" ADD COLUMN IF NOT EXISTS "failureCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LearningRule" ADD COLUMN IF NOT EXISTS "successRate" DOUBLE PRECISION;
ALTER TABLE "LearningRule" ADD COLUMN IF NOT EXISTS "lastAppliedAt" TIMESTAMP(3);

ALTER TABLE "Prediction" ADD COLUMN IF NOT EXISTS "appliedPromptImprovementIds" JSONB;

-- Legacy market-rule rows (title/description conclusions) must not enter prompts
UPDATE "LearningRule"
SET "isDeprecated" = true, "isActive" = false
WHERE "promptImprovement" IS NULL
   OR "problemType" IS NULL
   OR "rootCause" IS NULL
   OR (COALESCE("title", '') <> '' AND COALESCE("problemType", '') = '')
   OR "problemType" NOT IN (
     'CONTEXT_GAP',
     'REASONING_GAP',
     'SIGNAL_WEIGHTING_GAP',
     'CONFIDENCE_GAP',
     'RISK_GAP',
     'DATA_GAP',
     'TIME_WINDOW_GAP',
     'CONFLICTING_SIGNAL_GAP'
   );

CREATE INDEX IF NOT EXISTS "LearningRule_isDeprecated_createdAt_idx"
  ON "LearningRule"("isDeprecated", "createdAt");
