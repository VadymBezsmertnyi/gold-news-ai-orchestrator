/** Relative Ukrainian labels for prediction event window vs now. */

export type EventStateTone = "upcoming" | "active" | "ended";

export interface EventStateDisplay {
  primary: string;
  secondary: string | null;
  tone: EventStateTone;
}

function formatDurationParts(totalMins: number): string {
  if (totalMins < 60) return `${totalMins} хв`;

  const days = Math.floor(totalMins / (60 * 24));
  if (days >= 1) {
    const dayWord = days === 1 ? "день" : days < 5 ? "дні" : "днів";
    return `${days} ${dayWord}`;
  }

  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (mins === 0) return `${hours} год`;
  return `${hours} год ${mins} хв`;
}

function formatUntil(ms: number): string {
  const totalMins = Math.max(1, Math.ceil(ms / 60_000));
  return formatDurationParts(totalMins);
}

function formatAgo(ms: number): string {
  const totalMins = Math.max(1, Math.ceil(ms / 60_000));
  return `${formatDurationParts(totalMins)} тому`;
}

export function formatEventState(
  eventStartAt: string | null,
  eventEndAt: string | null,
  checkAfter: string,
  now = new Date(),
): EventStateDisplay {
  const start = eventStartAt ? new Date(eventStartAt) : null;
  const end = new Date(eventEndAt ?? checkAfter);

  if (!start || Number.isNaN(start.getTime())) {
    return { primary: "—", secondary: null, tone: "ended" };
  }

  const nowMs = now.getTime();

  if (nowMs < start.getTime()) {
    const diff = start.getTime() - nowMs;
    return {
      primary: `Почнеться через ${formatUntil(diff)}`,
      secondary: null,
      tone: "upcoming",
    };
  }

  if (nowMs <= end.getTime()) {
    const remaining = end.getTime() - nowMs;
    return {
      primary: "Активна",
      secondary: remaining > 0 ? `ще ${formatUntil(remaining)}` : null,
      tone: "active",
    };
  }

  const ago = nowMs - end.getTime();
  return {
    primary: "Завершилась",
    secondary: formatAgo(ago),
    tone: "ended",
  };
}
