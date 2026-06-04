// types
import type { DashboardResponse } from './types';

const apiBase = () =>
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function fetchDashboard(): Promise<DashboardResponse | null> {
  try {
    const res = await fetch(`${apiBase()}/orchestrator/dashboard`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as DashboardResponse;
  } catch {
    return null;
  }
}
