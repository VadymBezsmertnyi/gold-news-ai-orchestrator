import { PredictionDirection } from '@prisma/client';

import type { PromptImprovementSlice } from './prompt-improvement.types';

export type PredictionAgentInput = {
  title: string;
  summary?: string | null;
  category?: string | null;
  impactLevel?: string | null;
  goldImpact?: string | null;
  impactReason?: string | null;
  currentPrice: number;
  publishedAt: Date;
  promptImprovements?: PromptImprovementSlice[];
};

export type PredictionAgentOutput = {
  direction: PredictionDirection;
  confidence: number;
  expectedMovePercent: number;
  timeframeMinutes: number;
  reason: string;
};
