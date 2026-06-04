import { PredictionDirection } from '@prisma/client';

import type { NewsImpactGroup } from '../utils/news-impact-grouping';
import type { PromptImprovementSlice } from './prompt-improvement.types';

export type PredictionSessionNewsSlice = {
  title: string;
  impactLevel: string | null;
  goldImpact: string | null;
  publishedAt: Date;
};

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
  /** Same-session news grouped by impact (HIGH > MEDIUM > LOW). */
  sessionNewsByImpact?: NewsImpactGroup<PredictionSessionNewsSlice>;
};

export type PredictionAgentOutput = {
  direction: PredictionDirection;
  confidence: number;
  expectedMovePercent: number;
  timeframeMinutes: number;
  reason: string;
};
