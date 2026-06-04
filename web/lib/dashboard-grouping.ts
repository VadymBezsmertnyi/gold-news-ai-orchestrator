import type { DashboardNewsRow, DashboardPredictionRow } from "./types";

export function isImportantPrediction(row: DashboardPredictionRow): boolean {
  if (row.sourceType === "GLOBAL_CONTEXT") return true;
  if (row.result === "FAILED" || row.status === "FAILED") return true;
  if (row.confidence >= 70) return true;
  if ((row.impactLevel ?? "").toUpperCase() === "HIGH") return true;
  return false;
}

export function splitPredictions(rows: DashboardPredictionRow[]): {
  important: DashboardPredictionRow[];
  other: DashboardPredictionRow[];
} {
  const important: DashboardPredictionRow[] = [];
  const other: DashboardPredictionRow[] = [];
  for (const row of rows) {
    if (isImportantPrediction(row)) important.push(row);
    else other.push(row);
  }
  return { important, other };
}

export function isImportantNews(row: DashboardNewsRow): boolean {
  const level = (row.impactLevel ?? "").toUpperCase();
  return level === "HIGH" || level === "MEDIUM";
}

export function splitNews(rows: DashboardNewsRow[]): {
  important: DashboardNewsRow[];
  other: DashboardNewsRow[];
} {
  const important: DashboardNewsRow[] = [];
  const other: DashboardNewsRow[] = [];
  for (const row of rows) {
    if (isImportantNews(row)) important.push(row);
    else other.push(row);
  }
  return { important, other };
}

export function predictionSummaryChips(rows: DashboardPredictionRow[]) {
  const { important } = splitPredictions(rows);
  return {
    important: important.length,
    success: rows.filter((r) => r.result === "SUCCESS").length,
    failed: rows.filter((r) => r.result === "FAILED").length,
    pending: rows.filter((r) => r.status === "PENDING" && !r.result).length,
    missingBaseline: rows.filter((r) => r.missingEventStartPrice).length,
  };
}
