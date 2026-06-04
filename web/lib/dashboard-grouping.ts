import type { DashboardNewsRow, DashboardPredictionRow } from "./types";
import { sortPredictionsByCheckAfter } from "./dashboard-format";

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

export function sortPredictionsByImpact(
  rows: DashboardPredictionRow[],
): DashboardPredictionRow[] {
  const ordered = sortPredictionsByCheckAfter(rows);
  return [...ordered].sort((a, b) => {
    const impactDiff =
      impactSortOrder(a.impactLevel, a.sourceType) -
      impactSortOrder(b.impactLevel, b.sourceType);
    if (impactDiff !== 0) return impactDiff;
    return 0;
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
