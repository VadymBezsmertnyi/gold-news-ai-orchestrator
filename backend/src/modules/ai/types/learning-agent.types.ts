import type {
  LearningRule,
  NewsItem,
  Prediction,
  PredictionResult,
} from '@prisma/client';

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
  activeLearningRules: Pick<LearningRule, 'id' | 'title' | 'description'>[];
};

export type LearningAgentOutput = {
  shouldCreateRule: boolean;
  title: string;
  description: string;
  confidence: number;
  reason: string;
};
