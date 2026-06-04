import { formatTimeUk } from "./dashboard-format";
import { formatDurationDdHhMm } from "./dashboard-duration";

export type EventStateTone = "upcoming" | "active" | "ended";

export interface EventStateDisplay {
  title: string;
  line2: string | null;
  line3: string | null;
  tone: EventStateTone;
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
    return { title: "—", line2: null, line3: null, tone: "ended" };
  }

  const nowMs = now.getTime();
  const startMs = start.getTime();
  const endMs = end.getTime();

  if (nowMs < startMs) {
    return {
      title: "Starts soon",
      line2: `in ${formatDurationDdHhMm(startMs - nowMs)}`,
      line3: `at ${formatTimeUk(start)}`,
      tone: "upcoming",
    };
  }

  if (nowMs <= endMs) {
    const remaining = Math.max(0, endMs - nowMs);
    return {
      title: "Active",
      line2: `remaining ${formatDurationDdHhMm(remaining)}`,
      line3: `until ${formatTimeUk(end)}`,
      tone: "active",
    };
  }

  const ago = nowMs - endMs;
  return {
    title: "Finished",
    line2: `${formatDurationDdHhMm(ago)} ago`,
    line3: null,
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
  return formatDurationDdHhMm(ms);
}
