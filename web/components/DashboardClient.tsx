"use client";

// react
import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// lib
import { fetchDashboard } from "@/lib/api";
import {
  formatEventState,
  formatEventWindowDuration,
} from "@/lib/dashboard-event-state";
import {
  computeExpectedPrice,
  distanceToTargetPercent,
  resolveStartPrice,
} from "@/lib/dashboard-prediction-prices";
import {
  formatDateTimeUk,
  formatPercent,
  formatPrice,
  formatTimeUk,
  metaPreview,
} from "@/lib/dashboard-format";
import { liveEvaluationForRow } from "@/lib/dashboard-live-evaluation";
import {
  predictionSummaryChips,
  sortNewsByImpact,
  sortPredictionsByLifecycle,
} from "@/lib/dashboard-grouping";
import {
  CHIP_LABELS,
  connectionBadgeLabel,
  GLOBAL_CONTEXT_LABELS,
  LOG_HEADERS,
  NEWS_DETAIL_LABELS,
  NEWS_HEADERS,
  PREDICTION_DETAIL_LABELS,
  PREDICTION_HEADERS,
  ROW_DETAILS_LABELS,
  SECTION_TITLES,
  predictionSourceLabel,
  scorePercentTone,
  sourceBadgeLabel,
  STATS_LABELS,
  translateAnalysisStatus,
  translateBaselineSource,
  translateDirectionGuessBadge,
  translateImpactLevel,
  translateLogMessage,
  translatePredictionDisplayStatus,
  type LiveEvalTone,
  type PredictionStatusTone,
} from "@/lib/dashboard-i18n";
import type {
  DashboardGlobalContext,
  DashboardNewsRow,
  DashboardPredictionRow,
  DashboardResponse,
  DashboardServerLogRow,
} from "@/lib/types";

const REFRESH_MS = 10_000;
const PAGE_SHELL = "mx-auto w-full max-w-[1880px] px-4";
const TABLE_SHELL =
  "w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm";
const TABLE_CLASS = "w-full table-fixed border-collapse text-left text-sm";
const TH =
  "px-2 py-1 text-left text-[9px] font-semibold uppercase tracking-wide text-zinc-500";
const TD = "px-2 py-1 align-top text-[10px] leading-tight";
const TD_NUM = `${TD} tabular-nums`;

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
  size = "sm",
}: {
  label: string;
  tone:
    | "pending"
    | "ok"
    | "fail"
    | "muted"
    | PredictionStatusTone
    | LiveEvalTone
    | "upcoming"
    | "active"
    | "ended";
  size?: "sm" | "lg";
}) {
  const styles: Record<string, string> = {
    pending: "bg-amber-100 text-amber-900 border-amber-300 font-semibold",
    ok: "bg-emerald-100 text-emerald-800 border-emerald-200",
    fail: "bg-red-100 text-red-800 border-red-200",
    muted: "bg-zinc-100 text-zinc-600 border-zinc-200",
    success: "bg-emerald-600 text-white border-emerald-700 font-semibold",
    failed: "bg-red-600 text-white border-red-700 font-semibold",
    overdue: "bg-orange-500 text-white border-orange-600 font-semibold",
    noBaseline: "bg-zinc-700 text-white border-zinc-800 font-semibold",
    confirm: "bg-emerald-50 text-emerald-900 border-emerald-300 font-medium",
    deny: "bg-red-50 text-red-900 border-red-300 font-medium",
    insufficient: "bg-amber-50 text-amber-900 border-amber-200",
    upcoming: "bg-amber-50 text-amber-950 border-amber-300",
    active: "bg-emerald-50 text-emerald-900 border-emerald-300 font-medium",
    ended: "bg-zinc-100 text-zinc-700 border-zinc-300",
  };
  const sizeClass =
    size === "lg"
      ? "px-2.5 py-1 text-xs leading-snug"
      : "px-1.5 py-0.5 text-[10px] leading-tight";
  return (
    <span
      className={`inline-block rounded border ${sizeClass} ${styles[tone] ?? styles.muted}`}
    >
      {label}
    </span>
  );
}

const LIVE_EVAL_EMOJI: Record<LiveEvalTone, string> = {
  confirm: "🟢 ",
  deny: "🔴 ",
  insufficient: "🟡 ",
};

const EVENT_STATE_EMOJI = {
  upcoming: "🟡 ",
  active: "🟢 ",
  ended: "⚫ ",
} as const;

const STATUS_DOT: Record<PredictionStatusTone, string> = {
  success: "bg-emerald-500",
  failed: "bg-red-500",
  pending: "bg-amber-400",
  overdue: "bg-orange-500",
  noBaseline: "bg-zinc-500",
  muted: "bg-zinc-400",
};

const STATUS_TEXT: Record<PredictionStatusTone, string> = {
  success: "text-emerald-700",
  failed: "text-red-700",
  pending: "text-amber-800",
  overdue: "text-orange-700",
  noBaseline: "text-zinc-700",
  muted: "text-zinc-600",
};

function CompactStatusIndicator({
  label,
  tone,
}: {
  label: string;
  tone: PredictionStatusTone;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 font-medium ${STATUS_TEXT[tone]}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[tone]}`}
        aria-hidden
      />
      {label}
    </span>
  );
}

function PredictionStatusIndicator({
  row,
}: {
  row: Pick<
    DashboardPredictionRow,
    "result" | "status" | "isOverdue" | "missingEventStartPrice"
  >;
}) {
  const display = translatePredictionDisplayStatus(row);
  return (
    <CompactStatusIndicator label={display.label} tone={display.tone} />
  );
}

function ScorePercentCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-zinc-400">—</span>;
  const tone = scorePercentTone(value);
  const styles: Record<string, string> = {
    low: "text-red-800 bg-red-50 border-red-200",
    mid: "text-amber-900 bg-amber-50 border-amber-200",
    high: "text-emerald-900 bg-emerald-50 border-emerald-200",
    muted: "text-zinc-600 bg-zinc-50 border-zinc-200",
  };
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${styles[tone]}`}
    >
      {value.toFixed(0)}%
    </span>
  );
}

function EventStateCell({
  row,
}: {
  row: Pick<
    DashboardPredictionRow,
    "eventStartAt" | "eventEndAt" | "checkAfter"
  >;
}) {
  const state = formatEventState(
    row.eventStartAt,
    row.eventEndAt,
    row.checkAfter,
  );
  const emoji = EVENT_STATE_EMOJI[state.tone];
  const primary = state.title ?? state.line2;
  const secondary = state.title ? state.line2 : null;
  return (
    <div className="leading-tight">
      {primary ? (
        <p className="font-medium text-zinc-800">
          {emoji}
          {primary}
        </p>
      ) : null}
      {secondary ? (
        <p className="text-[9px] text-zinc-600">{secondary}</p>
      ) : null}
    </div>
  );
}

function PredictionMetricsCells({ row }: { row: DashboardPredictionRow }) {
  const start = resolveStartPrice(row);
  const expectedPrice = computeExpectedPrice(
    start,
    row.expectedMovePercent,
    row.direction,
  );
  const finalPrice = row.currentLivePrice;
  const distance = distanceToTargetPercent(
    start,
    expectedPrice,
    finalPrice,
    row.direction,
  );
  return (
    <>
      <td className={TD_NUM}>
        {expectedPrice != null ? (
          <span className="font-medium text-violet-900">
            {formatPrice(expectedPrice)}
          </span>
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </td>
      <td className={TD_NUM}>
        {finalPrice != null ? (
          <span className="font-medium text-emerald-800">
            {formatPrice(finalPrice)}
          </span>
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </td>
      <td className={TD_NUM}>
        {formatPercent(row.expectedMovePercent)}
      </td>
      <td className={TD_NUM}>{formatPercent(row.actualMovePercent)}</td>
      <td className={TD_NUM}>
        {distance != null ? (
          <span
            className={
              row.sourceType === "GLOBAL_CONTEXT"
                ? "font-medium text-violet-800"
                : "text-zinc-700"
            }
          >
            {distance.toFixed(2)}%
          </span>
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </td>
    </>
  );
}

function RowExpandButton({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="mr-1 shrink-0 rounded border border-zinc-200 bg-zinc-50 px-0.5 py-px text-[9px] leading-none text-zinc-600 hover:bg-zinc-100"
      title={expanded ? ROW_DETAILS_LABELS.collapse : ROW_DETAILS_LABELS.expand}
    >
      {expanded ? "▼" : "▶"}
    </button>
  );
}

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <div className="mt-0.5 text-xs text-zinc-800">{children}</div>
    </div>
  );
}

function PredictionRowDetails({ row }: { row: DashboardPredictionRow }) {
  const guess = translateDirectionGuessBadge(row.directionCorrect);
  const live = liveEvaluationForRow(row);
  const duration = formatEventWindowDuration(
    row.eventStartAt,
    row.eventEndAt,
    row.checkAfter,
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <DetailItem label={PREDICTION_DETAIL_LABELS.source}>
        <SourceTypeBadge sourceType={row.sourceType} />
      </DetailItem>
      <DetailItem label={PREDICTION_DETAIL_LABELS.baselineSource}>
        {row.missingEventStartPrice
          ? "—"
          : translateBaselineSource(row.baselineSource)}
      </DetailItem>
      <DetailItem label={PREDICTION_DETAIL_LABELS.eventDuration}>
        {duration ?? "—"}
      </DetailItem>
      <DetailItem label={PREDICTION_DETAIL_LABELS.liveEvaluation}>
        <StatusBadge
          label={`${LIVE_EVAL_EMOJI[live.tone]}${live.label}`}
          tone={live.tone}
        />
      </DetailItem>
      <DetailItem label={PREDICTION_DETAIL_LABELS.eventStart}>
        <SecondaryDateTime value={row.eventStartAt} />
      </DetailItem>
      <DetailItem label={PREDICTION_DETAIL_LABELS.eventEnd}>
        <SecondaryDateTime value={row.eventEndAt ?? row.checkAfter} />
      </DetailItem>
      <DetailItem label={PREDICTION_DETAIL_LABELS.pricePrediction}>
        {formatPrice(row.priceAtPrediction)}
      </DetailItem>
      <DetailItem label={PREDICTION_DETAIL_LABELS.priceEventStart}>
        {row.missingEventStartPrice ? (
          <span className="text-zinc-500">Немає стартової ціни</span>
        ) : (
          formatPrice(row.priceAtEventStart)
        )}
      </DetailItem>
      <DetailItem label={PREDICTION_DETAIL_LABELS.moveAccuracy}>
        <ScorePercentCell value={row.moveAccuracyPercent} />
      </DetailItem>
      <DetailItem label={PREDICTION_DETAIL_LABELS.finalScore}>
        <ScorePercentCell value={row.finalScore} />
      </DetailItem>
      <DetailItem label={PREDICTION_DETAIL_LABELS.directionGuess}>
        {guess.tone === "muted" ? (
          "—"
        ) : (
          <StatusBadge
            label={`${guess.tone === "ok" ? "🟢 " : "🔴 "}${guess.label}`}
            tone={guess.tone}
          />
        )}
      </DetailItem>
    </div>
  );
}

function NewsRowDetails({ row }: { row: DashboardNewsRow }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <DetailItem label={NEWS_DETAIL_LABELS.source}>{row.source}</DetailItem>
      <DetailItem label={NEWS_DETAIL_LABELS.published}>
        {formatDateTimeUk(row.publishedAt)}
      </DetailItem>
      <DetailItem label={NEWS_DETAIL_LABELS.category}>
        {row.category ?? "—"}
      </DetailItem>
      <DetailItem label={NEWS_DETAIL_LABELS.summary}>
        {row.analysisSummaryPreview ?? row.analysisSummary ?? "—"}
      </DetailItem>
    </div>
  );
}

function SecondaryDateTime({ value }: { value: string | null }) {
  if (!value) return <span className="text-zinc-400">—</span>;
  return (
    <span className="text-[10px] leading-snug text-zinc-500">
      {formatDateTimeUk(value)}
    </span>
  );
}

function ImpactLevelBadge({
  level,
  sourceType,
}: {
  level: string | null;
  sourceType?: string;
}) {
  if (sourceType === "GLOBAL_CONTEXT") {
    return (
      <span className="inline-block rounded border border-violet-300 bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-900">
        CTX
      </span>
    );
  }
  const key = (level ?? "").toUpperCase();
  const styles: Record<string, string> = {
    HIGH: "border-orange-400 bg-orange-100 text-orange-950 font-semibold",
    MEDIUM: "border-amber-300 bg-amber-50 text-amber-950",
    LOW: "border-slate-300 bg-slate-100 text-slate-700",
  };
  const short: Record<string, string> = {
    HIGH: "HIGH",
    MEDIUM: "MED",
    LOW: "LOW",
  };
  if (!short[key]) return <span className="text-zinc-400">—</span>;
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] leading-tight ${styles[key] ?? styles.LOW}`}
      title={translateImpactLevel(level)}
    >
      {short[key]}
    </span>
  );
}

function SummaryChips({ rows }: { rows: DashboardPredictionRow[] }) {
  const chips = predictionSummaryChips(rows);
  const items = [
    { label: CHIP_LABELS.highImpact, value: chips.highImpact },
    { label: CHIP_LABELS.success, value: chips.success },
    { label: CHIP_LABELS.failed, value: chips.failed },
    { label: CHIP_LABELS.pending, value: chips.pending },
    { label: CHIP_LABELS.missingBaseline, value: chips.missingBaseline },
  ];
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item.label}
          className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] text-zinc-700"
        >
          {item.label}: <strong className="tabular-nums">{item.value}</strong>
        </span>
      ))}
    </div>
  );
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
  if (row.result === "SUCCESS" || row.status === "SUCCESS")
    return "bg-emerald-50/50";
  if (row.result === "FAILED" || row.status === "FAILED") return "bg-red-50/45";
  if (row.missingEventStartPrice) return "bg-amber-50/55";
  if (row.status === "PENDING" && row.isOverdue) return "bg-amber-50/45";
  if (row.sourceType === "GLOBAL_CONTEXT") return "bg-violet-50/25";
  return "bg-white";
}

function predictionRowBorder(row: DashboardPredictionRow): string {
  if (row.sourceType === "GLOBAL_CONTEXT")
    return "border-l-4 border-l-violet-500";
  if (row.result === "SUCCESS" || row.status === "SUCCESS")
    return "border-l-4 border-l-emerald-500";
  if (row.result === "FAILED" || row.status === "FAILED")
    return "border-l-4 border-l-red-500";
  if (row.missingEventStartPrice || (row.status === "PENDING" && row.isOverdue))
    return "border-l-4 border-l-amber-500";
  return "border-l-4 border-l-transparent";
}

function predictionRowClasses(row: DashboardPredictionRow): string {
  const highAccent =
    (row.impactLevel ?? "").toUpperCase() === "HIGH"
      ? "ring-1 ring-inset ring-orange-200/60"
      : "";
  return `group ${predictionRowBg(row)} ${predictionRowBorder(row)} hover:brightness-[0.99] ${highAccent}`.trim();
}

function NewsTitleCell({ title }: { title: string }) {
  return (
    <span
      className="line-clamp-2 text-[11px] font-medium leading-tight text-zinc-800"
      title={title}
    >
      {title}
    </span>
  );
}

const PREDICTION_COL_WIDTHS = [
  "w-[24%]",
  "w-[5%]",
  "w-[6%]",
  "w-[5%]",
  "w-[8%]",
  "w-[13%]",
  "w-[8%]",
  "w-[8%]",
  "w-[7%]",
  "w-[7%]",
  "w-[9%]",
] as const;

const PREDICTION_COL_COUNT = PREDICTION_COL_WIDTHS.length;

function PredictionsTable({ rows }: { rows: DashboardPredictionRow[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const colCount = PREDICTION_COL_COUNT;

  return (
    <div className={TABLE_SHELL}>
      <table className={TABLE_CLASS}>
        <colgroup>
          {PREDICTION_COL_WIDTHS.map((w) => (
            <col key={w} className={w} />
          ))}
        </colgroup>
        <thead className="border-b border-zinc-200 bg-zinc-50">
          <tr>
            <th className={TH}>{PREDICTION_HEADERS.news}</th>
            <th className={TH}>{PREDICTION_HEADERS.impact}</th>
            <th className={TH}>{PREDICTION_HEADERS.direction}</th>
            <th className={TH}>{PREDICTION_HEADERS.confidence}</th>
            <th className={TH}>{PREDICTION_HEADERS.status}</th>
            <th className={TH}>{PREDICTION_HEADERS.eventState}</th>
            <th className={TH}>{PREDICTION_HEADERS.expectedPrice}</th>
            <th className={TH}>{PREDICTION_HEADERS.finalPrice}</th>
            <th className={TH}>{PREDICTION_HEADERS.expectedMove}</th>
            <th className={TH}>{PREDICTION_HEADERS.actualMove}</th>
            <th className={TH}>{PREDICTION_HEADERS.distanceToTarget}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => {
            const expanded = expandedId === row.id;
            return (
              <Fragment key={row.id}>
                <tr className={predictionRowClasses(row)}>
                  <td className={TD}>
                    <div className="flex items-start">
                      <RowExpandButton
                        expanded={expanded}
                        onToggle={() =>
                          setExpandedId(expanded ? null : row.id)
                        }
                      />
                      <NewsTitleCell title={row.newsTitle} />
                    </div>
                  </td>
                  <td className={TD}>
                    <ImpactLevelBadge
                      level={row.impactLevel}
                      sourceType={row.sourceType}
                    />
                  </td>
                  <td className={TD}>
                    <DirectionBadge direction={row.direction} />
                  </td>
                  <td className={TD_NUM}>{row.confidence}%</td>
                  <td className={TD}>
                    <PredictionStatusIndicator row={row} />
                  </td>
                  <td className={TD}>
                    <EventStateCell row={row} />
                  </td>
                  <PredictionMetricsCells row={row} />
                </tr>
                {expanded ? (
                  <tr
                    className={`${predictionRowBg(row)} border-l-4 border-l-zinc-300`}
                  >
                    <td colSpan={colCount} className="px-3 py-2">
                      <PredictionRowDetails row={row} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RecentNewsTable({ rows }: { rows: DashboardNewsRow[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const colCount = 4;

  return (
    <div className={TABLE_SHELL}>
      <table className={TABLE_CLASS}>
        <colgroup>
          <col className="w-[48%]" />
          <col className="w-[12%]" />
          <col className="w-[20%]" />
          <col className="w-[20%]" />
        </colgroup>
        <thead className="border-b border-zinc-200 bg-zinc-50">
          <tr>
            <th className={TH}>{NEWS_HEADERS.title}</th>
            <th className={TH}>{NEWS_HEADERS.impact}</th>
            <th className={TH}>{NEWS_HEADERS.status}</th>
            <th className={TH}>{NEWS_HEADERS.gold}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => {
            const expanded = expandedId === row.id;
            const isPending = row.analysisStatus === "PENDING";
            return (
              <Fragment key={row.id}>
                <tr
                  className={
                    isPending
                      ? "bg-amber-50/50 hover:bg-amber-50/70"
                      : "bg-white hover:bg-zinc-50/80"
                  }
                >
                  <td className={TD}>
                    <div className="flex items-start">
                      <RowExpandButton
                        expanded={expanded}
                        onToggle={() =>
                          setExpandedId(expanded ? null : row.id)
                        }
                      />
                      <NewsTitleCell title={row.title} />
                    </div>
                  </td>
                  <td className={TD}>
                    <ImpactLevelBadge level={row.impactLevel} />
                  </td>
                  <td className={TD}>
                    <StatusBadge
                      label={translateAnalysisStatus(row.analysisStatus)}
                      tone={analysisStatusTone(row.analysisStatus)}
                    />
                  </td>
                  <td className={`${TD} text-zinc-800`}>
                    {row.goldImpact ?? "—"}
                  </td>
                </tr>
                {expanded ? (
                  <tr className="bg-zinc-50/80">
                    <td colSpan={colCount} className="px-4 py-3">
                      <NewsRowDetails row={row} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GlobalContextCard({ ctx }: { ctx: DashboardGlobalContext }) {
  const [expanded, setExpanded] = useState(false);
  const drivers = ctx.activeDrivers.slice(0, 3);
  const risks = ctx.riskNotes.slice(0, 3);

  return (
    <div className="rounded-lg border border-violet-200/80 bg-gradient-to-br from-violet-50 to-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-baseline gap-3">
        <DirectionBadge direction={ctx.globalBias} />
        <p className="text-sm text-zinc-800">
          Впевненість:{" "}
          <strong className="tabular-nums">{ctx.confidence}%</strong>
        </p>
        <span className="text-[10px] text-zinc-500">
          {formatDateTimeUk(ctx.createdAt)}
        </span>
      </div>

      <div className="mt-4 border-t border-violet-100/80 pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          {GLOBAL_CONTEXT_LABELS.drivers}
        </p>
        {drivers.length > 0 ? (
          <ul className="mt-1.5 space-y-0.5 text-sm text-zinc-800">
            {drivers.map((d) => (
              <li key={d} className="flex gap-1.5">
                <span className="text-violet-400">•</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-zinc-500">—</p>
        )}
      </div>

      <div className="mt-3 border-t border-violet-100/80 pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800/90">
          {GLOBAL_CONTEXT_LABELS.risks}
        </p>
        {risks.length > 0 ? (
          <ul className="mt-1.5 space-y-0.5 text-sm text-amber-950/90">
            {risks.map((n) => (
              <li key={n} className="flex gap-1.5">
                <span className="text-amber-500">•</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-zinc-500">—</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 text-xs font-medium text-violet-800 underline-offset-2 hover:underline"
      >
        {expanded
          ? GLOBAL_CONTEXT_LABELS.hideFull
          : GLOBAL_CONTEXT_LABELS.showFull}
      </button>
      {expanded ? (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
          {ctx.summary}
        </p>
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
    return sortPredictionsByLifecycle(dashboard.recentPredictions);
  }, [dashboard, tick]);

  const sortedNews = useMemo(() => {
    if (!dashboard) return [];
    return sortNewsByImpact(dashboard.recentNews);
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
              <SummaryChips rows={sortedPredictions} />
              {sortedPredictions.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  Прогнози зʼявляться після автоматичного аналізу новин.
                </p>
              ) : (
                <PredictionsTable rows={sortedPredictions} />
              )}
            </section>

            <section>
              <SectionTitle>{SECTION_TITLES.recentNews}</SectionTitle>
              {sortedNews.length === 0 ? (
                <p className="text-xs text-zinc-500">Новин у вікні немає.</p>
              ) : (
                <RecentNewsTable rows={sortedNews} />
              )}
            </section>

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
