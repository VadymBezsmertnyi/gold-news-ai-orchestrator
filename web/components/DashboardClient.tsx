"use client";

// react
import { useEffect, useState } from "react";

// lib
import { fetchDashboard } from "@/lib/api";
import type {
  DashboardNewsRow,
  DashboardPredictionRow,
  DashboardResponse,
  DashboardServerLogRow,
  GlobalContextPlaceholder,
  LearningRule,
} from "@/lib/types";

const REFRESH_MS = 10_000;

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-amber-200/60 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-amber-900">{value}</p>
    </div>
  );
}

function AnalysisStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-900",
    ANALYZED: "bg-emerald-100 text-emerald-800",
    FAILED: "bg-red-100 text-red-800",
  };
  const className = styles[status] ?? "bg-zinc-100 text-zinc-700";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {status}
    </span>
  );
}

function LogLevelBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    info: "bg-sky-100 text-sky-800",
    warn: "bg-amber-100 text-amber-900",
    error: "bg-red-100 text-red-800",
  };
  const className = styles[level] ?? "bg-zinc-100 text-zinc-700";
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${className}`}>
      {level}
    </span>
  );
}

function formatPercent(value: number | null): string {
  if (value == null) return "—";
  return `${value.toFixed(2)}%`;
}

function formatPrice(value: number | null): string {
  if (value == null) return "—";
  return value.toFixed(2);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString();
}

function metaPreview(meta: unknown): string {
  if (meta == null) return "—";
  try {
    const text = JSON.stringify(meta);
    if (text.length <= 80) return text;
    return `${text.slice(0, 77)}...`;
  } catch {
    return "—";
  }
}

function GlobalContextCard({ context }: { context: GlobalContextPlaceholder }) {
  return (
    <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-amber-950">Global market context</h3>
        <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs text-amber-900">
          Placeholder
        </span>
      </div>
      <p className="mt-2 text-sm text-zinc-700">{context.message}</p>
      <p className="mt-2 text-sm text-zinc-600">
        News in window: {context.newsInWindowCount}
      </p>
    </div>
  );
}

function RecentNewsTable({ rows }: { rows: DashboardNewsRow[] }) {
  if (rows.length === 0)
    return (
      <p className="text-sm text-zinc-500">
        Waiting for news — scheduler syncs every 10 minutes automatically.
      </p>
    );

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200">
      <table className="min-w-full divide-y divide-zinc-200 text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Source</th>
            <th className="px-4 py-3">Published</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3">Impact</th>
            <th className="px-4 py-3">Gold impact</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 bg-white">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-amber-50/40">
              <td className="max-w-xs px-4 py-3 font-medium text-zinc-800">
                {row.title}
              </td>
              <td className="px-4 py-3">{row.source}</td>
              <td className="px-4 py-3 text-zinc-600">
                {formatDate(row.publishedAt)}
              </td>
              <td className="px-4 py-3">
                <AnalysisStatusBadge status={row.analysisStatus} />
              </td>
              <td className="px-4 py-3">{row.category ?? "—"}</td>
              <td className="px-4 py-3">{row.impactLevel ?? "—"}</td>
              <td className="px-4 py-3">{row.goldImpact ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PredictionsTable({ rows }: { rows: DashboardPredictionRow[] }) {
  if (rows.length === 0)
    return (
      <p className="text-sm text-zinc-500">
        Predictions appear automatically after news analysis runs.
      </p>
    );

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200">
      <table className="min-w-full divide-y divide-zinc-200 text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-4 py-3">News</th>
            <th className="px-4 py-3">Direction</th>
            <th className="px-4 py-3">Confidence</th>
            <th className="px-4 py-3">Expected move</th>
            <th className="px-4 py-3">Timeframe</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Price at pred.</th>
            <th className="px-4 py-3">Check after</th>
            <th className="px-4 py-3">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 bg-white">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-amber-50/40">
              <td className="max-w-xs px-4 py-3 font-medium text-zinc-800">
                {row.newsTitle}
              </td>
              <td className="px-4 py-3">{row.direction}</td>
              <td className="px-4 py-3">{row.confidence}%</td>
              <td className="px-4 py-3">
                {formatPercent(row.expectedMovePercent)}
              </td>
              <td className="px-4 py-3">{row.timeframeMinutes}m</td>
              <td className="px-4 py-3">{row.status}</td>
              <td className="px-4 py-3">
                {formatPrice(row.priceAtPrediction)}
              </td>
              <td className="px-4 py-3 text-zinc-600">
                {formatDate(row.checkAfter)}
              </td>
              <td className="px-4 py-3">{row.result ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ServerLogsPanel({ logs }: { logs: DashboardServerLogRow[] }) {
  if (logs.length === 0)
    return (
      <p className="text-sm text-zinc-500">
        Background job logs will appear here after the scheduler runs.
      </p>
    );

  return (
    <div className="max-h-96 overflow-y-auto rounded-xl border border-zinc-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="sticky top-0 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-4 py-3">Time</th>
            <th className="px-4 py-3">Level</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Message</th>
            <th className="px-4 py-3">Meta</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {logs.map((log) => (
            <tr key={log.id} className="hover:bg-zinc-50">
              <td className="whitespace-nowrap px-4 py-2 text-zinc-600">
                {formatTime(log.createdAt)}
              </td>
              <td className="px-4 py-2">
                <LogLevelBadge level={log.level} />
              </td>
              <td className="px-4 py-2 font-mono text-xs text-zinc-700">
                {log.type}
              </td>
              <td className="px-4 py-2 text-zinc-800">{log.message}</td>
              <td className="max-w-xs px-4 py-2 font-mono text-xs text-zinc-500">
                {metaPreview(log.meta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LearningRulesSection({ rules }: { rules: LearningRule[] }) {
  if (rules.length === 0)
    return (
      <p className="text-sm text-zinc-500">
        Learning rules are added when predictions fail evaluation.
      </p>
    );

  return (
    <ul className="space-y-3">
      {rules.map((rule) => (
        <li
          key={rule.id}
          className="rounded-lg border border-zinc-200 bg-white p-4"
        >
          <h3 className="font-medium text-zinc-900">{rule.title}</h3>
          <p className="mt-2 text-sm text-zinc-600">{rule.description}</p>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardClient() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const data = await fetchDashboard();
      if (!active) return;
      setDashboard(data);
      setLastUpdated(new Date());
      setLoading(false);
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-zinc-100">
      <header className="border-b border-amber-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <h1 className="text-2xl font-bold tracking-tight text-amber-950">
            GoldNews AI Orchestrator
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Live local demo — background jobs run automatically
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-500">
            <span>Auto-refresh: every 10s</span>
            <span>
              Last updated:{" "}
              {lastUpdated ? formatTime(lastUpdated.toISOString()) : "—"}
            </span>
            {dashboard?.lastNewsSyncAt ? (
              <span>
                Last news sync: {formatDate(dashboard.lastNewsSyncAt)}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-6 py-10">
        {loading && !dashboard ? (
          <p className="text-sm text-zinc-600">Loading dashboard…</p>
        ) : null}

        {!dashboard && !loading ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
            Could not load dashboard. Start the backend on port 3001 and set{" "}
            <code className="rounded bg-red-100 px-1">NEXT_PUBLIC_API_URL</code>
            .
          </div>
        ) : null}

        {dashboard ? (
          <>
            <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
              {dashboard.orchestratorNote}
            </p>

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard label="Total news" value={dashboard.stats.totalNews} />
              <StatCard
                label="Pending analysis"
                value={dashboard.stats.pendingAnalysisNewsCount}
              />
              <StatCard
                label="Analyzed news"
                value={dashboard.stats.analyzedNewsCount}
              />
              <StatCard
                label="Pending predictions"
                value={dashboard.stats.pendingPredictions}
              />
              <StatCard
                label="Success predictions"
                value={dashboard.stats.successfulPredictions}
              />
              <StatCard
                label="Failed predictions"
                value={dashboard.stats.failedPredictions}
              />
            </section>

            <section>
              <h2 className="mb-4 text-lg font-semibold text-zinc-900">
                Background job logs
              </h2>
              <ServerLogsPanel logs={dashboard.recentServerLogs} />
            </section>

            <section>
              <h2 className="mb-4 text-lg font-semibold text-zinc-900">
                Global context
              </h2>
              <GlobalContextCard context={dashboard.globalContext} />
            </section>

            <section>
              <h2 className="mb-4 text-lg font-semibold text-zinc-900">
                Recent news
              </h2>
              <RecentNewsTable rows={dashboard.recentNews} />
            </section>

            <section>
              <h2 className="mb-4 text-lg font-semibold text-zinc-900">
                Recent predictions
              </h2>
              <PredictionsTable rows={dashboard.recentPredictions} />
            </section>

            <section>
              <h2 className="mb-4 text-lg font-semibold text-zinc-900">
                Learning rules
              </h2>
              <LearningRulesSection rules={dashboard.learningRules} />
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
