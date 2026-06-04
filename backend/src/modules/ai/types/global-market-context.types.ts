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

import type { NewsImpactGroup } from '../utils/news-impact-grouping';
import type { PromptImprovementSlice } from './prompt-improvement.types';

export type GlobalMarketContextAgentInput = {
  currentPrice: number;
  pastNews: GlobalMarketContextNewsSlice[];
  upcomingNews: GlobalMarketContextNewsSlice[];
  highImpactNews: GlobalMarketContextNewsSlice[];
  mediumImpactNews: GlobalMarketContextNewsSlice[];
  lowImpactNews: GlobalMarketContextNewsSlice[];
  activePredictions: GlobalMarketContextPredictionSlice[];
  recentResults: GlobalMarketContextResultSlice[];
  promptImprovements: PromptImprovementSlice[];
  /** Full windows grouped by impact (past + upcoming combined). */
  sessionNewsByImpact?: NewsImpactGroup<GlobalMarketContextNewsSlice>;
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
