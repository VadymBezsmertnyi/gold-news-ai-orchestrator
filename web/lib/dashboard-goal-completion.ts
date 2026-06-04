import {
  getEventLifecyclePhase,
  type EventLifecyclePhase,
} from "./dashboard-event-state";
import { resolveStartPrice } from "./dashboard-prediction-prices";
import type { DashboardPredictionRow } from "./types";

export type GoalCompletionTone =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "darkGreen";

export function signedExpectedMovePercent(
  direction: string,
  expectedMovePercent: number | null,
): number | null {
  if (expectedMovePercent == null) return null;
  const magnitude = Math.abs(expectedMovePercent);
  if (direction === "BUY") return magnitude;
  if (direction === "SELL") return -magnitude;
  if (direction === "NEUTRAL") return 0;
  return magnitude;
}

/** BUY/SELL: +0.30% / -0.30% / NEUTRAL: 0.00% */
export function formatExpectedMoveDisplay(
  direction: string,
  expectedMovePercent: number | null,
): string {
  if (expectedMovePercent == null) return "—";
  if (direction === "NEUTRAL") return "0.00%";
  const signed = signedExpectedMovePercent(direction, expectedMovePercent);
  if (signed == null) return "—";
  const prefix = signed >= 0 ? "+" : "";
  return `${prefix}${signed.toFixed(2)}%`;
}

function signedMoveFromPrices(row: {
  missingEventStartPrice: boolean;
  priceAtEventStart: number | null;
  priceAtPrediction: number | null;
  currentLivePrice: number | null;
}): number | null {
  const start = resolveStartPrice(row);
  const price = row.currentLivePrice;
  if (start == null || price == null || start === 0) return null;
  return ((price - start) / start) * 100;
}

function resolveSignedActualMovePercent(
  row: DashboardPredictionRow,
  phase: EventLifecyclePhase,
): number | null {
  if (phase === "upcoming") return null;

  return signedMoveFromPrices(row);
}

export function computeGoalCompletionPercent(
  direction: string,
  signedActualMovePercent: number | null,
  expectedMovePercent: number | null,
): number | null {
  if (expectedMovePercent == null || expectedMovePercent === 0) return null;
  if (signedActualMovePercent == null) return null;

  const expectedMag = Math.abs(expectedMovePercent);

  if (direction === "NEUTRAL") {
    const actualMag = Math.abs(signedActualMovePercent);
    if (actualMag <= expectedMag) return 100;
    const penalty =
      ((actualMag - expectedMag) / expectedMag) * 100;
    return 100 - penalty;
  }

  const signedExpected = signedExpectedMovePercent(
    direction,
    expectedMovePercent,
  );
  if (signedExpected == null || signedExpected === 0) return null;

  const raw = (signedActualMovePercent / signedExpected) * 100;
  return Number.isFinite(raw) ? raw : null;
}

export function goalCompletionTone(value: number): GoalCompletionTone {
  if (value < 0) return "red";
  if (value < 50) return "orange";
  if (value < 80) return "yellow";
  if (value <= 100) return "green";
  return "darkGreen";
}

export function computeGoalCompletionForRow(
  row: DashboardPredictionRow,
  now = new Date(),
): number | null {
  const phase = getEventLifecyclePhase(
    row.eventStartAt,
    row.eventEndAt,
    row.checkAfter,
    now,
  );

  if (phase === "upcoming" || row.missingEventStartPrice) return null;

  const signedActual = resolveSignedActualMovePercent(row, phase);
  if (signedActual == null) return null;

  return computeGoalCompletionPercent(
    row.direction,
    signedActual,
    row.expectedMovePercent,
  );
}
