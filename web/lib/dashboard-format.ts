const UK_LOCALE = 'uk-UA';

export function formatTimeUk(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleTimeString(UK_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatDateTimeUk(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleString(UK_LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatPercent(value: number | null): string {
  if (value == null) return '—';
  return `${value.toFixed(2)}%`;
}

export function formatPrice(value: number | null): string {
  if (value == null) return '—';
  return value.toFixed(2);
}

/** `13:52:13 · через 52 хв` or `прострочено` when past due. */
export function formatCheckAfterUk(checkAfter: string, now = new Date()): string {
  const target = new Date(checkAfter);
  const timeStr = formatTimeUk(target);
  const diffMs = target.getTime() - now.getTime();

  if (diffMs <= 0) return `${timeStr} · прострочено`;

  const totalMins = Math.ceil(diffMs / 60_000);
  if (totalMins < 60) return `${timeStr} · через ${totalMins} хв`;

  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (mins === 0) return `${timeStr} · через ${hours} год`;
  return `${timeStr} · через ${hours} год ${mins} хв`;
}

export function metaPreview(meta: unknown): string {
  if (meta == null) return '—';
  try {
    const text = JSON.stringify(meta);
    if (text.length <= 80) return text;
    return `${text.slice(0, 77)}…`;
  } catch {
    return '—';
  }
}

/** Nearest checkAfter first; pending before completed. */
export function sortPredictionsByCheckAfter<
  T extends { checkAfter: string; status: string },
>(rows: T[]): T[] {
  const now = Date.now();
  return [...rows].sort((a, b) => {
    const aPending = a.status === 'PENDING' ? 0 : 1;
    const bPending = b.status === 'PENDING' ? 0 : 1;
    if (aPending !== bPending) return aPending - bPending;

    const aDiff = new Date(a.checkAfter).getTime() - now;
    const bDiff = new Date(b.checkAfter).getTime() - now;
    const aKey = aDiff >= 0 ? aDiff : 1e15 + Math.abs(aDiff);
    const bKey = bDiff >= 0 ? bDiff : 1e15 + Math.abs(bDiff);
    return aKey - bKey;
  });
}
