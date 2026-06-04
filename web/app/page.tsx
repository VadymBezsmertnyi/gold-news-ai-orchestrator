// lib
import { fetchDashboard } from '@/lib/api';
import type { DashboardPredictionRow, LearningRule } from '@/lib/types';

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-amber-200/60 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-amber-900">{value}</p>
    </div>
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

function PredictionsTable({ rows }: { rows: DashboardPredictionRow[] }) {
  if (rows.length === 0)
    return (
      <p className="text-sm text-zinc-500">
        No predictions yet. Seed data via POST /predictions/mock on the API.
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
            <th className="px-4 py-3">Price before</th>
            <th className="px-4 py-3">Price after</th>
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
              <td className="px-4 py-3">{formatPrice(row.priceBefore)}</td>
              <td className="px-4 py-3">{formatPrice(row.priceAfter)}</td>
              <td className="px-4 py-3">{row.result ?? '—'}</td>
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
        No learning rules yet. Add via POST /learning-rules when predictions fail.
      </p>
    );

  return (
    <ul className="space-y-3">
      {rules.map((rule) => (
        <li
          key={rule.id}
          className="rounded-lg border border-zinc-200 bg-white p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium text-zinc-900">{rule.title}</h3>
            <span
              className={
                rule.isActive
                  ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800'
                  : 'rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600'
              }
            >
              {rule.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          <p className="mt-2 text-sm text-zinc-600">{rule.description}</p>
        </li>
      ))}
    </ul>
  );
}

export default async function DashboardPage() {
  const dashboard = await fetchDashboard();

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-zinc-100">
      <header className="border-b border-amber-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <h1 className="text-2xl font-bold tracking-tight text-amber-950">
            GoldNews AI Orchestrator
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Educational analytics for XAUUSD / gold news — foundation dashboard
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-6 py-10">
        {!dashboard ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
            Could not load dashboard. Start the backend and set{' '}
            <code className="rounded bg-red-100 px-1">NEXT_PUBLIC_API_URL</code>.
          </div>
        ) : (
          <>
            <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
              {dashboard.orchestratorNote}
            </p>

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total news" value={dashboard.stats.totalNews} />
              <StatCard
                label="Pending predictions"
                value={dashboard.stats.pendingPredictions}
              />
              <StatCard
                label="Successful predictions"
                value={dashboard.stats.successfulPredictions}
              />
              <StatCard
                label="Failed predictions"
                value={dashboard.stats.failedPredictions}
              />
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
        )}
      </main>
    </div>
  );
}
