"use client";

// react
import { useEffect, useMemo, useState, type ReactNode } from "react";

// lib
import { fetchDashboard } from "@/lib/api";
import {
  formatBaselineStartDelta,
  formatCheckAfterUk,
  formatDateTimeUk,
  formatPercent,
  formatPrice,
  formatTimeUk,
  metaPreview,
  sortPredictionsByCheckAfter,
} from "@/lib/dashboard-format";
import {
  BASELINE_START_DELTA_TOOLTIP,
  connectionBadgeLabel,
  LOG_HEADERS,
  NEWS_HEADERS,
  PREDICTION_HEADERS,
  SECTION_TITLES,
  predictionSourceLabel,
  sourceBadgeLabel,
  STATS_LABELS,
  translateAnalysisStatus,
  translateBaselineSource,
  translateLogMessage,
  translateDirectionCorrect,
  translateExpectedResult,
  translatePredictionStatus,
  translateResult,
} from "@/lib/dashboard-i18n";
import type {
  DashboardGlobalContext,
  DashboardNewsRow,
  DashboardPredictionRow,
  DashboardResponse,
  DashboardServerLogRow,
} from "@/lib/types";

const REFRESH_MS = 10_000;
const PAGE_SHELL = "mx-auto w-[calc(100vw-32px)] max-w-[1900px]";
const TABLE_SCROLL =
  "overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300";
const PREDICTIONS_TABLE_MIN = "min-w-[1800px] w-full border-collapse text-left text-xs";
const NEWS_TABLE_MIN = "min-w-[1100px] w-full border-collapse text-left text-xs";
const TH = "whitespace-nowrap px-2 py-1.5 font-medium";
const TD = "whitespace-nowrap px-2 py-1.5 align-middle";

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-zinc-200/90 bg-white px-2 py-1.5 shadow-sm">
      <p className="truncate text-[9px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="text-base font-semibold leading-tight tabular-nums text-amber-950">
        {value}
      </p>
    </div>
  );
}

function SourceTypeBadge({ sourceType }: { sourceType: string }) {
  const isGlobal = sourceType === "GLOBAL_CONTEXT";
  return (
    <span
      className={
        isGlobal
          ? "inline-block rounded border border-violet-300 bg-violet-100 px-1 py-px text-[10px] font-semibold leading-tight text-violet-900"
          : "inline-block rounded border border-sky-300 bg-sky-100 px-1 py-px text-[10px] font-semibold leading-tight text-sky-900"
      }
    >
      {predictionSourceLabel(sourceType)}
    </span>
  );
}

function DirectionBadge({ direction }: { direction: string }) {
  const styles: Record<string, string> = {
    BUY: "bg-emerald-100 text-emerald-800 border-emerald-200",
    SELL: "bg-red-100 text-red-800 border-red-200",
    NEUTRAL: "bg-zinc-100 text-zinc-700 border-zinc-200",
  };
  return (
    <span
      className={`inline-block rounded border px-1 py-px text-[10px] font-semibold leading-tight ${styles[direction] ?? "bg-zinc-100"}`}
    >
      {direction}
    </span>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "pending" | "ok" | "fail" | "muted";
}) {
  const styles = {
    pending: "bg-amber-100 text-amber-900 border-amber-200",
    ok: "bg-emerald-100 text-emerald-800 border-emerald-200",
    fail: "bg-red-100 text-red-800 border-red-200",
    muted: "bg-zinc-100 text-zinc-600 border-zinc-200",
  };
  return (
    <span
      className={`inline-block rounded border px-1 py-px text-[10px] font-medium leading-tight ${styles[tone]}`}
    >
      {label}
    </span>
  );
}

function predictionStatusTone(
  status: string,
  isOverdue = false
): "pending" | "ok" | "fail" | "muted" {
  if (status === "PENDING" && isOverdue) return "fail";
  if (status === "PENDING") return "pending";
  if (status === "SUCCESS") return "ok";
  if (status === "FAILED" || status === "EXPIRED") return "fail";
  return "muted";
}

function analysisStatusTone(
  status: string
): "pending" | "ok" | "fail" | "muted" {
  if (status === "PENDING") return "pending";
  if (status === "ANALYZED") return "ok";
  if (status === "FAILED") return "fail";
  return "muted";
}

function HeaderLivePrice({ dashboard }: { dashboard: DashboardResponse }) {
  const { marketPrice, metaApiStatus } = dashboard;
  const isMeta = marketPrice.source === "metaapi";

  return (
    <div className="shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2.5 shadow-sm">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        <span>XAUUSD</span>
        <span
          className={
            isMeta
              ? "rounded bg-emerald-600 px-1.5 py-0.5 text-white"
              : "rounded bg-amber-500 px-1.5 py-0.5 text-white"
          }
        >
          {sourceBadgeLabel(marketPrice.source)}
        </span>
        <span
          className={
            metaApiStatus.connected
              ? "rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800"
              : "rounded bg-amber-100 px-1.5 py-0.5 text-amber-900"
          }
        >
          {connectionBadgeLabel(metaApiStatus.connected)}
        </span>
      </div>
      <p className="mt-0.5 text-2xl font-bold tabular-nums text-zinc-900">
        {marketPrice.price.toFixed(2)}
      </p>
      <p className="text-xs tabular-nums text-zinc-600">
        {marketPrice.bid.toFixed(2)} / {marketPrice.ask.toFixed(2)}
      </p>
      <p className="mt-1 text-[10px] text-zinc-500">
        {formatTimeUk(marketPrice.updatedAt)}
      </p>
    </div>
  );
}

function DashboardHeader({
  dashboard,
  lastUpdated,
}: {
  dashboard: DashboardResponse;
  lastUpdated: Date | null;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-amber-200/70 bg-white/95 backdrop-blur-sm">
      <div
        className={`${PAGE_SHELL} flex flex-col gap-2 px-2 py-2 lg:flex-row lg:items-start lg:justify-between`}
      >
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold tracking-tight text-amber-950">
            GoldNews AI Orchestrator
          </h1>
          <ul className="mt-1 space-y-0.5 text-xs text-zinc-600">
            <li>Автооновлення: кожні 10 сек</li>
            <li>
              Останнє оновлення: {lastUpdated ? formatTimeUk(lastUpdated) : "—"}
            </li>
            <li>
              Остання синхронізація новин:{" "}
              {dashboard.lastNewsSyncAt
                ? formatDateTimeUk(dashboard.lastNewsSyncAt)
                : "—"}
            </li>
          </ul>
        </div>
        <HeaderLivePrice dashboard={dashboard} />
      </div>

      <div
        className={`${PAGE_SHELL} grid grid-cols-2 gap-1.5 px-2 pb-2 sm:grid-cols-4 xl:grid-cols-8`}
      >
        <StatCard
          label={STATS_LABELS.totalNews}
          value={dashboard.stats.totalNews}
        />
        <StatCard
          label={STATS_LABELS.pendingAnalysis}
          value={dashboard.stats.pendingAnalysisNewsCount}
        />
        <StatCard
          label={STATS_LABELS.analyzed}
          value={dashboard.stats.analyzedNewsCount}
        />
        <StatCard
          label={STATS_LABELS.failedAnalysis}
          value={dashboard.stats.failedAnalysisNewsCount}
        />
        <StatCard
          label={STATS_LABELS.pendingPredictions}
          value={dashboard.stats.pendingPredictions}
        />
        <StatCard
          label={STATS_LABELS.activePredictions}
          value={dashboard.stats.activePredictions}
        />
        <StatCard
          label={STATS_LABELS.successful}
          value={dashboard.stats.successfulPredictions}
        />
        <StatCard
          label={STATS_LABELS.failed}
          value={dashboard.stats.failedPredictions}
        />
      </div>
    </header>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-700">
      {children}
    </h2>
  );
}

function predictionRowBg(row: DashboardPredictionRow): string {
  if (row.sourceType === "GLOBAL_CONTEXT") return "bg-violet-50/35";
  if (row.missingEventStartPrice) return "bg-amber-50/55";
  if (row.result === "SUCCESS" || row.status === "SUCCESS")
    return "bg-emerald-50/45";
  if (row.result === "FAILED" || row.status === "FAILED")
    return "bg-red-50/40";
  if (row.status === "PENDING" && row.isOverdue) return "bg-amber-50/40";
  return "bg-white";
}

function predictionRowClasses(row: DashboardPredictionRow): string {
  const bg = predictionRowBg(row);
  const hover =
    row.sourceType === "GLOBAL_CONTEXT"
      ? "hover:bg-violet-50/55"
      : "hover:bg-zinc-50/80";
  const border =
    row.sourceType === "GLOBAL_CONTEXT"
      ? "border-l-4 border-l-violet-400"
      : "";
  return `group ${bg} ${hover} ${border}`.trim();
}

function stickyNewsCell(rowBg: string, isHeader = false): string {
  const bg = isHeader ? "bg-zinc-50" : rowBg;
  return `sticky left-0 z-20 min-w-[17.5rem] max-w-[20rem] ${bg} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.07)]`;
}

function stickyDirectionCell(rowBg: string, isHeader = false): string {
  const bg = isHeader ? "bg-zinc-50" : rowBg;
  return `sticky left-[17.5rem] z-10 min-w-[4.5rem] ${bg} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)]`;
}

function NewsTitleCell({ title }: { title: string }) {
  return (
    <span
      className="line-clamp-3 text-[11px] font-medium leading-snug text-zinc-800"
      title={title}
    >
      {title}
    </span>
  );
}

function PredictionsTable({ rows }: { rows: DashboardPredictionRow[] }) {
  if (rows.length === 0)
    return (
      <p className="text-xs text-zinc-500">
        Прогнози зʼявляться після автоматичного аналізу новин.
      </p>
    );

  const showPreview = (row: DashboardPredictionRow) =>
    row.status === "PENDING" &&
    !row.result &&
    !row.missingEventStartPrice &&
    row.isPreview &&
    !!row.previewOutcome;

  return (
    <div className={TABLE_SCROLL}>
      <table className={PREDICTIONS_TABLE_MIN}>
        <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] uppercase tracking-wide text-zinc-500">
          <tr>
            <th className={`${TH} ${stickyNewsCell("bg-zinc-50", true)}`}>
              {PREDICTION_HEADERS.news}
            </th>
            <th className={TH}>{PREDICTION_HEADERS.source}</th>
            <th className={`${TH} ${stickyDirectionCell("bg-zinc-50", true)}`}>
              {PREDICTION_HEADERS.direction}
            </th>
            <th className={TH}>{PREDICTION_HEADERS.confidence}</th>
            <th className={TH}>{PREDICTION_HEADERS.status}</th>
            <th className={TH}>{PREDICTION_HEADERS.result}</th>
            <th className={TH}>{PREDICTION_HEADERS.pricePrediction}</th>
            <th className={TH}>{PREDICTION_HEADERS.priceEventStart}</th>
            <th className={TH}>{PREDICTION_HEADERS.baselineSource}</th>
            <th className={TH}>{PREDICTION_HEADERS.current}</th>
            <th className={TH}>{PREDICTION_HEADERS.actualMove}</th>
            <th className={TH}>{PREDICTION_HEADERS.expectedMove}</th>
            <th className={TH}>{PREDICTION_HEADERS.accuracy}</th>
            <th className={TH}>{PREDICTION_HEADERS.directionOk}</th>
            <th className={TH}>{PREDICTION_HEADERS.preview}</th>
            <th className={TH}>{PREDICTION_HEADERS.eventStart}</th>
            <th className={TH}>{PREDICTION_HEADERS.eventEnd}</th>
            <th
              className={TH}
              title={BASELINE_START_DELTA_TOOLTIP}
            >
              {PREDICTION_HEADERS.baselineTimeDiff}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => {
            const rowBg = predictionRowBg(row);
            return (
              <tr key={row.id} className={predictionRowClasses(row)}>
                <td className={`${TD} ${stickyNewsCell(rowBg)}`}>
                  <NewsTitleCell title={row.newsTitle} />
                </td>
                <td className={TD}>
                  <SourceTypeBadge sourceType={row.sourceType} />
                </td>
                <td className={`${TD} ${stickyDirectionCell(rowBg)}`}>
                  <DirectionBadge direction={row.direction} />
                </td>
                <td className={`${TD} tabular-nums`}>{row.confidence}%</td>
                <td className={TD}>
                  <StatusBadge
                    label={translatePredictionStatus(
                      row.status,
                      row.isOverdue,
                    )}
                    tone={predictionStatusTone(row.status, row.isOverdue)}
                  />
                </td>
                <td className={TD}>
                  {row.result ? (
                    <StatusBadge
                      label={translateResult(row.result)}
                      tone={row.result === "SUCCESS" ? "ok" : "fail"}
                    />
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </td>
                <td className={`${TD} tabular-nums text-zinc-700`}>
                  {formatPrice(row.priceAtPrediction)}
                </td>
                <td className={`${TD} tabular-nums font-medium text-violet-900`}>
                  {row.missingEventStartPrice ? (
                    <StatusBadge label="Немає старту" tone="pending" />
                  ) : (
                    formatPrice(row.priceAtEventStart)
                  )}
                </td>
                <td className={`${TD} text-zinc-600`}>
                  {row.missingEventStartPrice
                    ? translateBaselineSource("missing")
                    : translateBaselineSource(row.baselineSource)}
                </td>
                <td className={`${TD} tabular-nums font-medium text-emerald-800`}>
                  {formatPrice(row.currentLivePrice)}
                </td>
                <td className={`${TD} tabular-nums`}>
                  {formatPercent(row.actualMovePercent)}
                </td>
                <td className={`${TD} tabular-nums`}>
                  {formatPercent(row.expectedMovePercent)}
                </td>
                <td className={`${TD} tabular-nums`}>
                  {row.finalScore != null
                    ? `${row.finalScore.toFixed(0)}%`
                    : row.moveAccuracyPercent != null
                      ? `${row.moveAccuracyPercent.toFixed(0)}%`
                      : "—"}
                </td>
                <td className={`${TD} tabular-nums`}>
                  {translateDirectionCorrect(row.directionCorrect)}
                </td>
                <td className={TD}>
                  {showPreview(row) ? (
                    <StatusBadge
                      label={translateExpectedResult(row.previewOutcome)}
                      tone={row.previewOutcome === "SUCCESS" ? "ok" : "fail"}
                    />
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </td>
                <td className={`${TD} text-zinc-600`}>
                  {row.eventStartAt
                    ? formatDateTimeUk(row.eventStartAt)
                    : "—"}
                </td>
                <td className={`${TD} text-zinc-600`}>
                  {row.eventEndAt
                    ? formatDateTimeUk(row.eventEndAt)
                    : formatCheckAfterUk(row.checkAfter)}
                </td>
                <td
                  className={`${TD} tabular-nums text-zinc-600`}
                  title={BASELINE_START_DELTA_TOOLTIP}
                >
                  {formatBaselineStartDelta(row.baselineTimeDiffSeconds)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RecentNewsTable({ rows }: { rows: DashboardNewsRow[] }) {
  if (rows.length === 0)
    return (
      <p className="text-xs text-zinc-500">
        Синхронізація новин кожні 10 хвилин.
      </p>
    );

  return (
    <div className={TABLE_SCROLL}>
      <table className={NEWS_TABLE_MIN}>
        <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] uppercase tracking-wide text-zinc-500">
          <tr>
            <th
              className={`${TH} sticky left-0 z-20 min-w-[17.5rem] max-w-[20rem] bg-zinc-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]`}
            >
              {NEWS_HEADERS.title}
            </th>
            <th className={TH}>{NEWS_HEADERS.source}</th>
            <th className={TH}>{NEWS_HEADERS.published}</th>
            <th className={TH}>{NEWS_HEADERS.status}</th>
            <th className={TH}>{NEWS_HEADERS.category}</th>
            <th className={TH}>{NEWS_HEADERS.impact}</th>
            <th className={TH}>{NEWS_HEADERS.gold}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => (
            <tr key={row.id} className="bg-white hover:bg-zinc-50/80">
              <td className="sticky left-0 z-10 min-w-[17.5rem] max-w-[20rem] bg-white px-2 py-1.5 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] group-hover:bg-inherit">
                <NewsTitleCell title={row.title} />
              </td>
              <td className={TD}>{row.source}</td>
              <td className={`${TD} text-zinc-600`}>
                {formatDateTimeUk(row.publishedAt)}
              </td>
              <td className={TD}>
                <StatusBadge
                  label={translateAnalysisStatus(row.analysisStatus)}
                  tone={analysisStatusTone(row.analysisStatus)}
                />
              </td>
              <td className={TD}>{row.category ?? "—"}</td>
              <td className={TD}>{row.impactLevel ?? "—"}</td>
              <td className={TD}>{row.goldImpact ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PendingNewsTable({ rows }: { rows: DashboardNewsRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-amber-200/80 bg-amber-50/40 [scrollbar-width:thin]">
      <table className="min-w-[720px] w-full border-collapse text-left text-xs">
        <thead className="border-b border-amber-200/60 text-[10px] uppercase text-amber-900/70">
          <tr>
            <th className="sticky left-0 z-20 min-w-[17.5rem] bg-amber-50/90 px-2 py-1.5 font-medium shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
              {NEWS_HEADERS.title}
            </th>
            <th className={TH}>{NEWS_HEADERS.source}</th>
            <th className={TH}>{NEWS_HEADERS.published}</th>
            <th className={TH}>{NEWS_HEADERS.status}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-amber-100/80">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="sticky left-0 z-10 min-w-[17.5rem] max-w-[20rem] bg-amber-50/40 px-2 py-1.5 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)]">
                <NewsTitleCell title={row.title} />
              </td>
              <td className={TD}>{row.source}</td>
              <td className={TD}>{formatDateTimeUk(row.publishedAt)}</td>
              <td className={TD}>
                <StatusBadge label="Очікує" tone="pending" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GlobalContextCard({ ctx }: { ctx: DashboardGlobalContext }) {
  return (
    <div className="rounded-lg border border-violet-200/80 bg-gradient-to-br from-violet-50 to-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <DirectionBadge direction={ctx.globalBias} />
        <span className="text-xs text-zinc-600">
          Впевненість: <strong>{ctx.confidence}%</strong>
        </span>
        <span className="text-[10px] text-zinc-500">
          {formatDateTimeUk(ctx.createdAt)}
        </span>
      </div>
      <p className="mt-2 text-sm text-zinc-800">{ctx.summary}</p>
      {ctx.activeDrivers.length > 0 ? (
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase text-zinc-500">
            Драйвери
          </p>
          <ul className="mt-1 list-inside list-disc text-xs text-zinc-700">
            {ctx.activeDrivers.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {ctx.riskNotes.length > 0 ? (
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase text-amber-800/80">
            Ризики
          </p>
          <ul className="mt-1 list-inside list-disc text-xs text-amber-900/90">
            {ctx.riskNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PromptImprovementsList({
  items,
}: {
  items: DashboardResponse["promptImprovements"];
}) {
  if (items.length === 0)
    return (
      <p className="text-xs text-zinc-500">
        Покращення зʼявляться після невдалих прогнозів, якщо агент навчання
        знайде узагальнену помилку міркування (не висновок про ринок).
      </p>
    );

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="rounded-lg border border-violet-200/80 bg-violet-50/40 px-3 py-2 text-xs"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-violet-900">
              {item.problemType}
            </span>
            {item.confidence != null ? (
              <span className="text-[10px] text-violet-700">
                впевненість {item.confidence}%
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-zinc-600">
            <span className="font-medium text-zinc-700">Причина: </span>
            {item.rootCause}
          </p>
          <p className="mt-1 text-zinc-800">
            <span className="font-medium text-zinc-700">Покращення: </span>
            {item.promptImprovement}
          </p>
          <p className="mt-1 text-[10px] text-zinc-500">
            {formatDateTimeUk(item.createdAt)}
            {item.sourcePredictionId
              ? ` · прогноз ${item.sourcePredictionId.slice(0, 8)}…`
              : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

function DeprecatedLearningRulesList({
  rules,
}: {
  rules: DashboardResponse["deprecatedLearningRules"];
}) {
  if (rules.length === 0) return null;

  return (
    <ul className="mt-2 space-y-2">
      {rules.map((rule) => (
        <li
          key={rule.id}
          className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs opacity-75"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-zinc-700 line-through">
              {rule.title ?? "Без назви"}
            </span>
            <StatusBadge label="Застаріле" tone="muted" />
          </div>
          <p className="mt-1 text-zinc-500">{rule.description ?? "—"}</p>
          <p className="mt-1 text-[10px] text-zinc-400">
            {formatDateTimeUk(rule.createdAt)} · не використовується в промптах
          </p>
        </li>
      ))}
    </ul>
  );
}

function LogLevelBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    info: "bg-sky-900 text-sky-200",
    warn: "bg-amber-900 text-amber-200",
    error: "bg-red-900 text-red-200",
  };
  return (
    <span
      className={`rounded px-1 py-0.5 text-[10px] font-medium ${styles[level] ?? "bg-zinc-800"}`}
    >
      {level}
    </span>
  );
}

function ServerLogsPanel({ logs }: { logs: DashboardServerLogRow[] }) {
  if (logs.length === 0)
    return (
      <p className="text-xs text-zinc-500">
        Логи зʼявляться після роботи планувальника та MetaAPI.
      </p>
    );

  return (
    <div className="max-h-[260px] overflow-auto rounded-lg border border-zinc-700 bg-zinc-950 [scrollbar-width:thin]">
      <table className="min-w-full text-left text-xs text-zinc-200">
        <thead className="sticky top-0 bg-zinc-900 text-[10px] uppercase text-zinc-500">
          <tr>
            <th className="px-2 py-1.5">{LOG_HEADERS.time}</th>
            <th className="px-2 py-1.5">{LOG_HEADERS.level}</th>
            <th className="px-2 py-1.5">{LOG_HEADERS.type}</th>
            <th className="px-2 py-1.5">{LOG_HEADERS.message}</th>
            <th className="px-2 py-1.5">{LOG_HEADERS.meta}</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr
              key={log.id}
              className="border-t border-zinc-800 hover:bg-zinc-900/90"
            >
              <td className="whitespace-nowrap px-2 py-1 font-mono text-[10px] text-zinc-500">
                {formatTimeUk(log.createdAt)}
              </td>
              <td className="px-2 py-1">
                <LogLevelBadge level={log.level} />
              </td>
              <td className="px-2 py-1 font-mono text-[10px] text-violet-300">
                {log.type}
              </td>
              <td className="px-2 py-1 text-zinc-300">
                {translateLogMessage(log.message)}
              </td>
              <td className="max-w-[12rem] truncate px-2 py-1 font-mono text-[10px] text-zinc-600">
                {metaPreview(log.meta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DashboardClient() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const data = await fetchDashboard();
      if (!active) return;
      setDashboard(data);
      setLastUpdated(new Date());
      setLoading(false);
      setTick((t) => t + 1);
    };

    void load();
    const interval = setInterval(() => {
      void load();
    }, REFRESH_MS);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const sortedPredictions = useMemo(() => {
    if (!dashboard) return [];
    return sortPredictionsByCheckAfter(dashboard.recentPredictions);
  }, [dashboard, tick]);

  const pendingNews = useMemo(() => {
    if (!dashboard) return [];
    return dashboard.recentNews.filter((n) => n.analysisStatus === "PENDING");
  }, [dashboard]);

  return (
    <div className="min-h-screen bg-zinc-100">
      {dashboard ? (
        <DashboardHeader dashboard={dashboard} lastUpdated={lastUpdated} />
      ) : null}

      <main className={`${PAGE_SHELL} space-y-4 py-4`}>
        {loading && !dashboard ? (
          <p className="text-xs text-zinc-600">Завантаження…</p>
        ) : null}

        {!dashboard && !loading ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Не вдалося підключити API. Запустіть backend на порту 3001.
          </div>
        ) : null}

        {dashboard ? (
          <>
            <section>
              <SectionTitle>{SECTION_TITLES.globalContext}</SectionTitle>
              {dashboard.globalContext ? (
                <GlobalContextCard ctx={dashboard.globalContext} />
              ) : (
                <p className="text-xs text-zinc-500">
                  Глобальний контекст ще не згенеровано. Запустіть вручну POST
                  /orchestrator/global-context/run або дочекайтесь події / 30
                  хв.
                </p>
              )}
            </section>

            <section>
              <SectionTitle>{SECTION_TITLES.predictions}</SectionTitle>
              <PredictionsTable rows={sortedPredictions} />
            </section>

            <section>
              <SectionTitle>{SECTION_TITLES.recentNews}</SectionTitle>
              <RecentNewsTable rows={dashboard.recentNews} />
            </section>

            {pendingNews.length > 0 ? (
              <section>
                <SectionTitle>{SECTION_TITLES.pendingNews}</SectionTitle>
                <PendingNewsTable rows={pendingNews} />
              </section>
            ) : null}

            <section>
              <SectionTitle>{SECTION_TITLES.promptImprovements}</SectionTitle>
              <PromptImprovementsList items={dashboard.promptImprovements} />
              {dashboard.deprecatedLearningRules.length > 0 ? (
                <>
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    {SECTION_TITLES.deprecatedRules}
                  </p>
                  <DeprecatedLearningRulesList
                    rules={dashboard.deprecatedLearningRules}
                  />
                </>
              ) : null}
            </section>

            <section>
              <SectionTitle>{SECTION_TITLES.logs}</SectionTitle>
              <ServerLogsPanel logs={dashboard.recentServerLogs} />
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
