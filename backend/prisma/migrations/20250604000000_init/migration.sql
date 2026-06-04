-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PredictionDirection" AS ENUM ('BUY', 'SELL', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "PredictionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "NewsItem" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "summary" TEXT,
    "rawPayload" JSONB,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL,
    "newsItemId" TEXT NOT NULL,
    "direction" "PredictionDirection" NOT NULL,
    "confidence" INTEGER NOT NULL,
    "expectedMovePercent" DOUBLE PRECISION,
    "timeframeMinutes" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "PredictionStatus" NOT NULL DEFAULT 'PENDING',
    "priceAtPrediction" DOUBLE PRECISION,
    "checkAfter" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "status" "AgentRunStatus" NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketPriceSnapshot" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL DEFAULT 'XAUUSD',
    "price" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketPriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictionResult" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "priceBefore" DOUBLE PRECISION NOT NULL,
    "priceAfter" DOUBLE PRECISION NOT NULL,
    "actualMovePercent" DOUBLE PRECISION NOT NULL,
    "isSuccess" BOOLEAN NOT NULL,
    "explanation" TEXT,
    "evaluatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PredictionResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningRule" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sourcePredictionId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsItem_externalId_key" ON "NewsItem"("externalId");

-- CreateIndex
CREATE INDEX "Prediction_status_idx" ON "Prediction"("status");

-- CreateIndex
CREATE INDEX "Prediction_newsItemId_idx" ON "Prediction"("newsItemId");

-- CreateIndex
CREATE INDEX "AgentRun_agentName_idx" ON "AgentRun"("agentName");

-- CreateIndex
CREATE INDEX "MarketPriceSnapshot_symbol_capturedAt_idx" ON "MarketPriceSnapshot"("symbol", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PredictionResult_predictionId_key" ON "PredictionResult"("predictionId");

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_newsItemId_fkey" FOREIGN KEY ("newsItemId") REFERENCES "NewsItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionResult" ADD CONSTRAINT "PredictionResult_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
