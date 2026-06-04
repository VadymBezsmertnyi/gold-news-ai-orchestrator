const DEFAULT_PAST_HOURS = 6;
const DEFAULT_FUTURE_HOURS = 12;

export function getNewsSyncPastHours(): number {
  const raw = process.env.NEWS_SYNC_PAST_HOURS;
  const n = raw != null && raw !== '' ? Number(raw) : DEFAULT_PAST_HOURS;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_PAST_HOURS;
}

export function getNewsSyncFutureHours(): number {
  const raw = process.env.NEWS_SYNC_FUTURE_HOURS;
  const n = raw != null && raw !== '' ? Number(raw) : DEFAULT_FUTURE_HOURS;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_FUTURE_HOURS;
}
