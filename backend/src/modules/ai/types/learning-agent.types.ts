import type { NewsItem, Prediction, PredictionResult } from '@prisma/client';

import type { PromptImprovementSlice } from './prompt-improvement.types';

export type LearningAgentNewsSlice = {
  id: string;
  title: string;
  publishedAt: Date;
  category: string | null;
  impactLevel: string | null;
  goldImpact: string | null;
  analysisSummary: string | null;
};

export type LearningAgentInput = {
  news: NewsItem;
  prediction: Prediction;
  result: PredictionResult;
  currentPrice: number;
  recentNews: LearningAgentNewsSlice[];
  activePromptImprovements: PromptImprovementSlice[];
};

export type LearningAgentOutput = {
  shouldCreateImprovement: boolean;
  problemType: string;
  rootCause: string;
  promptImprovement: string;
  confidence: number;
};
