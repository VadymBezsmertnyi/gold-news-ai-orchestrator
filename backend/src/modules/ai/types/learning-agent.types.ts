import type { LearningDeclineReason } from '../../learning/prompt-improvement.constants';

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
  news: {
    id: string;
    title: string;
    category: string | null;
    impactLevel: string | null;
    goldImpact: string | null;
    analysisSummary: string | null;
  };
  prediction: {
    id: string;
    direction: string;
    confidence: number;
    reason: string;
    sourceType: string;
  };
  result: {
    isSuccess: boolean;
    actualMovePercent: number;
    priceBefore: number;
    priceAfter: number;
  };
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
  declineReason?: LearningDeclineReason | string;
};
