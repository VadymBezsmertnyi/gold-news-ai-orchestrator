import { formatDurationHumanUk } from "./dashboard-duration";

export type EventStateTone = "upcoming" | "active" | "ended";

export type EventLifecyclePhase = "active" | "upcoming" | "finished";

export interface EventStateDisplay {
  title: string | null;
  line2: string | null;
  tone: EventStateTone;
}

export function getEventLifecyclePhase(
  eventStartAt: string | null,
  eventEndAt: string | null,
  checkAfter: string,
  now = new Date(),
): EventLifecyclePhase {
  const start = eventStartAt ? new Date(eventStartAt) : null;
  const end = new Date(eventEndAt ?? checkAfter);

  if (!start || Number.isNaN(start.getTime())) return "finished";

  const nowMs = now.getTime();
  if (nowMs < start.getTime()) return "upcoming";
  if (nowMs <= end.getTime()) return "active";
  return "finished";
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
    return { title: "—", line2: null, tone: "ended" };
  }

  const nowMs = now.getTime();
  const startMs = start.getTime();
  const endMs = end.getTime();

  if (nowMs < startMs) {
    return {
      title: null,
      line2: `Почнеться через ${formatDurationHumanUk(startMs - nowMs)}`,
      tone: "upcoming",
    };
  }

  if (nowMs <= endMs) {
    const remaining = Math.max(0, endMs - nowMs);
    return {
      title: "Активна",
      line2: `залишилось ${formatDurationHumanUk(remaining)}`,
      tone: "active",
    };
  }

  const ago = nowMs - endMs;
  return {
    title: "Завершена",
    line2: `${formatDurationHumanUk(ago)} тому`,
    tone: "ended",
  };
}

export function formatEventWindowDuration(
  eventStartAt: string | null,
  eventEndAt: string | null,
  checkAfter: string,
): string | null {
  if (!eventStartAt) return null;
  const start = new Date(eventStartAt);
  const end = new Date(eventEndAt ?? checkAfter);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const ms = Math.max(0, end.getTime() - start.getTime());
  return formatDurationHumanUk(ms);
}
