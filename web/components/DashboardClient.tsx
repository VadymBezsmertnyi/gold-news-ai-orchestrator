'use client';

// react
import { useEffect, useState } from 'react';

// lib
import { fetchDashboard } from '@/lib/api';
import type {
  DashboardNewsRow,
  DashboardPredictionRow,
  DashboardResponse,
  DashboardServerLogRow,
} from '@/lib/types';

const REFRESH_MS = 10_000;

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-amber-200/60 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-amber-900">{value}</p>
    </div>
  );
}

function LivePriceCard({
  dashboard,
}: {
  dashboard: DashboardResponse;
}) {
  const { marketPrice, metaApiStatus } = dashboard;
  const isLive = marketPrice.source === 'metaapi';

  return (
    <div
      className={
        isLive
          ? 'rounded-xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm'
          : 'rounded-xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-white p-6 shadow-sm'
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-600">Live XAUUSD</p>
          <p className="mt-1 text-4xl font-bold tracking-tight text-zinc-900">
            {marketPrice.price.toFixed(2)}
          </p>
          <p className="mt-2 text-sm text-zinc-600">
            Bid {marketPrice.bid.toFixed(2)} · Ask {marketPrice.ask.toFixed(2)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={
              isLive
                ? 'rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white'
                : 'rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white'
            }
          >
            {marketPrice.source}
          </span>
          <span
            className={
              metaApiStatus.connected
                ? 'text-xs font-medium text-emerald-700'
                : 'text-xs font-medium text-amber-800'
            }
          >
            {metaApiStatus.connected ? '● connected' : '○ not connected'}
          </span>
          <span className="text-xs text-zinc-500">
            Updated {formatTime(marketPrice.updatedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

function AnalysisStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-900',
    ANALYZED: 'bg-emerald-100 text-emerald-800',
    FAILED: 'bg-red-100 text-red-800',
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? 'bg-zinc-100 text-zinc-700'}`}
    >
      {status}
    </span>
  );
}

function LogLevelBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    info: 'bg-sky-100 text-sky-800',
    warn: 'bg-amber-100 text-amber-900',
    error: 'bg-red-100 text-red-800',
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium ${styles[level] ?? 'bg-zinc-100'}`}
    >
      {level}
    </span>
  );
}

function LogTypeBadge({ type }: { type: string }) {
  const isMeta = type.startsWith('METAAPI');
  return (
    <span
      className={
        isMeta
          ? 'rounded bg-violet-100 px-1.5 py-0.5 font-mono text-xs text-violet-800'
          : 'rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-700'
      }
    >
      {type}
    </span>
  );
}

function formatPercent(value: number | null): string {
  if (value == null) return '—';
  return `${value.toFixed(2)}%`;
}

function formatPrice(value: number | null): string {
  if (value == null) return '—';
  return value.toFixed(2);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString();
}

function metaPreview(meta: unknown): string {
  if (meta == null) return '—';
  try {
    const text = JSON.stringify(meta);
    if (text.length <= 100) return text;
    return `${text.slice(0, 97)}…`;
  } catch {
    return '—';
  }
}

function ServerLogsPanel({ logs }: { logs: DashboardServerLogRow[] }) {
  if (logs.length === 0)
    return (
      <p className="text-sm text-zinc-500">
        Background logs appear after scheduler and MetaAPI jobs run.
      </p>
    );

  return (
    <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-950 text-zinc-100">
      <table className="min-w-full text-left text-sm">
        <thead className="sticky top-0 bg-zinc-900 text-xs uppercase text-zinc-400">
          <tr>
            <th className="px-3 py-2">Time</th>
            <th className="px-3 py-2">Lvl</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Message</th>
            <th className="px-3 py-2">Meta</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr
              key={log.id}
              className="border-t border-zinc-800 hover:bg-zinc-900/80"
            >
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-400">
                {formatTime(log.createdAt)}
              </td>
              <td className="px-3 py-2">
                <LogLevelBadge level={log.level} />
              </td>
              <td className="px-3 py-2">
                <LogTypeBadge type={log.type} />
              </td>
              <td className="px-3 py-2 text-zinc-200">{log.message}</td>
              <td className="max-w-[14rem] truncate px-3 py-2 font-mono text-xs text-zinc-500">
                {metaPreview(log.meta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecentNewsTable({ rows }: { rows: DashboardNewsRow[] }) {
  if (rows.length === 0)
    return (
      <p className="text-sm text-zinc-500">
        News sync runs every 10 minutes automatically.
      </p>
    );

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200">
      <table className="min-w-full divide-y divide-zinc-200 text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
          <tr>
            <th className="px-3 py-2">Title</th>
            <th className="px-3 py-2">Source</th>
            <th className="px-3 py-2">Published</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Category</th>
            <th className="px-3 py-2">Impact</th>
            <th className="px-3 py-2">Gold</th>
            <th className="px-3 py-2">Summary</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 bg-white">
          {rows.map((row) => (
            <tr key={row.id} className="align-top hover:bg-amber-50/50">
              <td className="max-w-[12rem] px-3 py-2 font-medium">{row.title}</td>
              <td className="px-3 py-2">{row.source}</td>
              <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-600">
                {formatDate(row.publishedAt)}
              </td>
              <td className="px-3 py-2">
                <AnalysisStatusBadge status={row.analysisStatus} />
              </td>
              <td className="px-3 py-2">{row.category ?? '—'}</td>
              <td className="px-3 py-2">{row.impactLevel ?? '—'}</td>
              <td className="px-3 py-2">{row.goldImpact ?? '—'}</td>
              <td className="max-w-xs px-3 py-2 text-xs text-zinc-600">
                {row.analysisSummaryPreview ?? '—'}
              </td>
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
        Predictions are created automatically after news analysis.
      </p>
    );

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200">
      <table className="min-w-full divide-y divide-zinc-200 text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
          <tr>
            <th className="px-3 py-2">News</th>
            <th className="px-3 py-2">Dir</th>
            <th className="px-3 py-2">Conf</th>
            <th className="px-3 py-2">Move</th>
            <th className="px-3 py-2">TF</th>
            <th className="px-3 py-2">@ pred</th>
            <th className="px-3 py-2">Live</th>
            <th className="px-3 py-2">Check after</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 bg-white">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-amber-50/50">
              <td className="max-w-[10rem] px-3 py-2 font-medium">
                {row.newsTitle}
              </td>
              <td className="px-3 py-2">{row.direction}</td>
              <td className="px-3 py-2">{row.confidence}%</td>
              <td className="px-3 py-2">
                {formatPercent(row.expectedMovePercent)}
              </td>
              <td className="px-3 py-2">{row.timeframeMinutes}m</td>
              <td className="px-3 py-2">
                {formatPrice(row.priceAtPrediction)}
              </td>
              <td className="px-3 py-2 font-medium text-emerald-800">
                {formatPrice(row.currentLivePrice)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-xs">
                {formatDate(row.checkAfter)}
              </td>
              <td className="px-3 py-2">{row.status}</td>
              <td className="px-3 py-2">{row.result ?? '—'}</td>
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
      <header className="border-b border-amber-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <h1 className="text-2xl font-bold text-amber-950">
            GoldNews AI Orchestrator
          </h1>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-500">
            <span>Auto-refresh: every 10s</span>
            <span>
              Last updated:{' '}
              {lastUpdated ? formatTime(lastUpdated.toISOString()) : '—'}
            </span>
            {dashboard?.lastNewsSyncAt ? (
              <span>Last news sync: {formatDate(dashboard.lastNewsSyncAt)}</span>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        {loading && !dashboard ? (
          <p className="text-sm text-zinc-600">Loading dashboard…</p>
        ) : null}

        {!dashboard && !loading ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
            Cannot reach API. Run backend on port 3001 and set{' '}
            <code className="rounded bg-red-100 px-1">NEXT_PUBLIC_API_URL</code>.
          </div>
        ) : null}

        {dashboard ? (
          <>
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
              {dashboard.orchestratorNote}
            </p>

            <LivePriceCard dashboard={dashboard} />

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                label="Failed analysis"
                value={dashboard.stats.failedAnalysisNewsCount}
              />
              <StatCard
                label="Pending predictions"
                value={dashboard.stats.pendingPredictions}
              />
              <StatCard
                label="Active predictions"
                value={dashboard.stats.activePredictions}
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
              <h2 className="mb-3 text-lg font-semibold">Background job logs</h2>
              <ServerLogsPanel logs={dashboard.recentServerLogs} />
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold">Recent news</h2>
              <RecentNewsTable rows={dashboard.recentNews} />
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold">Recent predictions</h2>
              <PredictionsTable rows={dashboard.recentPredictions} />
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
