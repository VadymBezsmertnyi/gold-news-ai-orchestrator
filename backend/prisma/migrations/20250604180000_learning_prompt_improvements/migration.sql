-- Prompt improvements architecture (deprecate legacy market-conclusion rules)

ALTER TABLE "LearningRule" ADD COLUMN IF NOT EXISTS "problemType" TEXT;
ALTER TABLE "LearningRule" ADD COLUMN IF NOT EXISTS "rootCause" TEXT;
ALTER TABLE "LearningRule" ADD COLUMN IF NOT EXISTS "promptImprovement" TEXT;
ALTER TABLE "LearningRule" ADD COLUMN IF NOT EXISTS "confidence" INTEGER;
ALTER TABLE "LearningRule" ADD COLUMN IF NOT EXISTS "isDeprecated" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "LearningRule" ALTER COLUMN "title" DROP NOT NULL;
ALTER TABLE "LearningRule" ALTER COLUMN "description" DROP NOT NULL;

-- Existing rows stored one-time market observations — exclude from future prompts
UPDATE "LearningRule" SET "isDeprecated" = true WHERE "promptImprovement" IS NULL;

CREATE INDEX IF NOT EXISTS "LearningRule_isActive_isDeprecated_idx"
  ON "LearningRule"("isActive", "isDeprecated");
