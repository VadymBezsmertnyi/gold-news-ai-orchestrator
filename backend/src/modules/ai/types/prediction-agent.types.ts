import { PredictionDirection } from '@prisma/client';

export type PredictionAgentInput = {
  title: string;
  summary?: string | null;
  category?: string | null;
  impactLevel?: string | null;
  goldImpact?: string | null;
  impactReason?: string | null;
  currentPrice: number;
  publishedAt: Date;
};

export type PredictionAgentOutput = {
  direction: PredictionDirection;
  confidence: number;
  expectedMovePercent: number;
  timeframeMinutes: number;
  reason: string;
};
