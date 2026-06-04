import { PredictionDirection } from '@prisma/client';

export type GlobalMarketContextNewsSlice = {
  id: string;
  title: string;
  publishedAt: Date;
  category: string | null;
  impactLevel: string | null;
  goldImpact: string | null;
  analysisSummary: string | null;
};

export type GlobalMarketContextPredictionSlice = {
  id: string;
  sourceType: string;
  direction: string;
  confidence: number;
  status: string;
  reason: string;
  createdAt: Date;
};

export type GlobalMarketContextResultSlice = {
  predictionId: string;
  isSuccess: boolean;
  actualMovePercent: number;
  evaluatedAt: Date;
  predictionDirection: string;
  newsTitle: string | null;
};

export type GlobalMarketContextLearningRuleSlice = {
  id: string;
  title: string;
  description: string;
};

export type GlobalMarketContextAgentInput = {
  currentPrice: number;
  pastNews: GlobalMarketContextNewsSlice[];
  upcomingNews: GlobalMarketContextNewsSlice[];
  activePredictions: GlobalMarketContextPredictionSlice[];
  recentResults: GlobalMarketContextResultSlice[];
  learningRules: GlobalMarketContextLearningRuleSlice[];
};

export type GlobalMarketContextAgentOutput = {
  globalBias: PredictionDirection;
  confidence: number;
  expectedMovePercent: number;
  timeframeMinutes: number;
  summary: string;
  activeDrivers: string[];
  riskNotes: string[];
};
