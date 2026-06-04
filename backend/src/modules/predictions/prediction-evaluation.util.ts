import { PredictionDirection } from '@prisma/client';

export type BaselineSource =
  | 'priceAtEventStart'
  | 'snapshot_before'
  | 'snapshot_after'
  | 'fallback_current'
  | 'priceAtPrediction';

export interface PredictionScoreResult {
  actualMovePercent: number;
  moveAccuracyPercent: number;
  directionCorrect: boolean;
  finalScore: number;
  isSuccess: boolean;
  signedMovePercent: number;
}

export function resolveEventStartAt(prediction: {
  eventStartAt: Date | null;
  createdAt: Date;
  newsItem?: {
    eventStartAt: Date | null;
    publishedAt: Date;
  } | null;
}): Date {
  return (
    prediction.eventStartAt ??
    prediction.newsItem?.eventStartAt ??
    prediction.newsItem?.publishedAt ??
    prediction.createdAt
  );
}

export function computePredictionScore(
  direction: PredictionDirection,
  baseline: number,
  priceAfter: number,
  expectedMovePercent: number | null,
): PredictionScoreResult {
  const signedMovePercent =
    baseline === 0 ? 0 : ((priceAfter - baseline) / baseline) * 100;
  const actualMovePercent = Math.abs(signedMovePercent);
  const expected = expectedMovePercent ?? 0.1;

  let directionCorrect = false;
  if (direction === PredictionDirection.BUY)
    directionCorrect = priceAfter > baseline;
  else if (direction === PredictionDirection.SELL)
    directionCorrect = priceAfter < baseline;
  else directionCorrect = actualMovePercent <= expected;

  const moveAccuracyPercent =
    expected > 0 ? Math.min(100, (actualMovePercent / expected) * 100) : 0;

  let isSuccess = false;
  if (direction === PredictionDirection.NEUTRAL)
    isSuccess = actualMovePercent <= expected;
  else isSuccess = directionCorrect && moveAccuracyPercent >= 25;

  const finalScore =
    direction === PredictionDirection.NEUTRAL
      ? isSuccess
        ? 100
        : Math.max(0, 100 - moveAccuracyPercent)
      : directionCorrect
        ? moveAccuracyPercent
        : 0;

  return {
    actualMovePercent,
    moveAccuracyPercent,
    directionCorrect,
    finalScore,
    isSuccess,
    signedMovePercent,
  };
}

export function buildEvaluationExplanation(
  direction: PredictionDirection,
  baseline: number,
  priceAfter: number,
  score: PredictionScoreResult,
  baselineSource: BaselineSource,
  isSuccess: boolean,
): string {
  const outcome = isSuccess ? 'SUCCESS' : 'FAILED';
  return [
    `${outcome}: ${direction}`,
    `baseline ${baseline.toFixed(2)} (${baselineSource})`,
    `→ ${priceAfter.toFixed(2)}`,
    `move ${score.signedMovePercent.toFixed(3)}%`,
    `accuracy ${score.moveAccuracyPercent.toFixed(1)}%`,
    `score ${score.finalScore.toFixed(1)}`,
    `directionCorrect=${score.directionCorrect}`,
  ].join(' — ');
}
