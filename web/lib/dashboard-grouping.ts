import type { DashboardNewsRow, DashboardPredictionRow } from "./types";
import { getEventLifecyclePhase } from "./dashboard-event-state";

/** Lower = higher priority (HIGH first). GLOBAL_CONTEXT sorts with HIGH. */
export function impactSortOrder(
  level: string | null,
  sourceType?: string,
): number {
  if (sourceType === "GLOBAL_CONTEXT") return 0;
  const key = (level ?? "").toUpperCase();
  if (key === "HIGH") return 1;
  if (key === "MEDIUM") return 2;
  if (key === "LOW") return 3;
  return 4;
}

const LIFECYCLE_ORDER: Record<"active" | "upcoming" | "finished", number> = {
  active: 0,
  upcoming: 1,
  finished: 2,
};

function eventEndMs(row: DashboardPredictionRow): number {
  return new Date(row.eventEndAt ?? row.checkAfter).getTime();
}

function eventStartMs(row: DashboardPredictionRow): number {
  return row.eventStartAt
    ? new Date(row.eventStartAt).getTime()
    : eventEndMs(row);
}

/** Active → upcoming → finished; sorted within each group by event times. */
export function sortPredictionsByLifecycle(
  rows: DashboardPredictionRow[],
  now = new Date(),
): DashboardPredictionRow[] {
  return [...rows].sort((a, b) => {
    const phaseA = getEventLifecyclePhase(
      a.eventStartAt,
      a.eventEndAt,
      a.checkAfter,
      now,
    );
    const phaseB = getEventLifecyclePhase(
      b.eventStartAt,
      b.eventEndAt,
      b.checkAfter,
      now,
    );

    const groupDiff = LIFECYCLE_ORDER[phaseA] - LIFECYCLE_ORDER[phaseB];
    if (groupDiff !== 0) return groupDiff;

    if (phaseA === "active") return eventEndMs(a) - eventEndMs(b);
    if (phaseA === "upcoming") return eventStartMs(a) - eventStartMs(b);
    return eventEndMs(b) - eventEndMs(a);
  });
}

export function sortNewsByImpact(rows: DashboardNewsRow[]): DashboardNewsRow[] {
  return [...rows].sort((a, b) => {
    const impactDiff =
      impactSortOrder(a.impactLevel) - impactSortOrder(b.impactLevel);
    if (impactDiff !== 0) return impactDiff;
    return (
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  });
}

export function predictionSummaryChips(rows: DashboardPredictionRow[]) {
  return {
    highImpact: rows.filter(
      (r) =>
        r.sourceType === "GLOBAL_CONTEXT" ||
        (r.impactLevel ?? "").toUpperCase() === "HIGH",
    ).length,
    success: rows.filter((r) => r.result === "SUCCESS").length,
    failed: rows.filter((r) => r.result === "FAILED").length,
    pending: rows.filter((r) => r.status === "PENDING" && !r.result).length,
    missingBaseline: rows.filter((r) => r.missingEventStartPrice).length,
  };
}
