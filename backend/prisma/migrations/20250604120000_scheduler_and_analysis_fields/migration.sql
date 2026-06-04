-- CreateEnum
CREATE TYPE "NewsAnalysisStatus" AS ENUM ('PENDING', 'ANALYZED', 'FAILED');

-- CreateEnum
CREATE TYPE "PredictionSourceType" AS ENUM ('SINGLE_NEWS', 'GLOBAL_CONTEXT');

-- AlterTable
ALTER TABLE "NewsItem" ADD COLUMN     "analysisStatus" "NewsAnalysisStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "analysisSummary" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "impactLevel" TEXT,
ADD COLUMN     "goldImpact" TEXT,
ADD COLUMN     "analyzedAt" TIMESTAMP(3),
ADD COLUMN     "analysisError" TEXT;

-- CreateIndex
CREATE INDEX "NewsItem_analysisStatus_idx" ON "NewsItem"("analysisStatus");

-- CreateTable
CREATE TABLE "MarketContextAnalysis" (
    "id" TEXT NOT NULL,
    "globalBias" "PredictionDirection" NOT NULL,
    "confidence" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "activeDrivers" JSONB,
    "riskNotes" JSONB,
    "newsWindowStart" TIMESTAMP(3) NOT NULL,
    "newsWindowEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketContextAnalysis_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Prediction" ADD COLUMN     "sourceType" "PredictionSourceType" NOT NULL DEFAULT 'SINGLE_NEWS',
ADD COLUMN     "validFrom" TIMESTAMP(3),
ADD COLUMN     "validUntil" TIMESTAMP(3),
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "globalContextId" TEXT,
ADD COLUMN     "invalidationReason" TEXT;

-- CreateIndex
CREATE INDEX "Prediction_globalContextId_idx" ON "Prediction"("globalContextId");

-- CreateIndex
CREATE INDEX "Prediction_sourceType_idx" ON "Prediction"("sourceType");

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_globalContextId_fkey" FOREIGN KEY ("globalContextId") REFERENCES "MarketContextAnalysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;
