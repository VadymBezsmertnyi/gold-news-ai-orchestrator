import type { DashboardPredictionRow } from "./types";

export type LiveEvaluationTone = "confirm" | "deny" | "insufficient";

export function computeLiveEvaluation(row: {
  direction: string;
  missingEventStartPrice: boolean;
  priceAtEventStart: number | null;
  currentLivePrice: number | null;
  expectedMovePercent: number | null;
}): { label: string; tone: LiveEvaluationTone } {
  if (row.missingEventStartPrice) {
    return { label: "Недостатньо даних", tone: "insufficient" };
  }

  const baseline = row.priceAtEventStart;
  const current = row.currentLivePrice;
  if (baseline == null || current == null || baseline === 0) {
    return { label: "Недостатньо даних", tone: "insufficient" };
  }

  const signedMove = ((current - baseline) / baseline) * 100;
  const expected = row.expectedMovePercent ?? 0.1;
  const threshold = expected * 0.5;

  if (row.direction === "BUY") {
    if (signedMove >= threshold) {
      return { label: "Ринок підтверджує", tone: "confirm" };
    }
    return { label: "Ринок заперечує", tone: "deny" };
  }

  if (row.direction === "SELL") {
    if (signedMove <= -threshold) {
      return { label: "Ринок підтверджує", tone: "confirm" };
    }
    return { label: "Ринок заперечує", tone: "deny" };
  }

  return { label: "Недостатньо даних", tone: "insufficient" };
}

export function liveEvaluationForRow(
  row: DashboardPredictionRow,
): { label: string; tone: LiveEvaluationTone } {
  return computeLiveEvaluation(row);
}
