/** Live capture window around eventStartAt (seconds). */
export const EVENT_START_CAPTURE_WINDOW_SECONDS = Number(
  process.env.EVENT_START_CAPTURE_WINDOW_SECONDS ?? 30,
);

/** Max predictions to backfill per capture job run. */
export const EVENT_START_CAPTURE_BATCH_LIMIT = Number(
  process.env.EVENT_START_CAPTURE_BATCH_LIMIT ?? 10,
);

/** Max skew (seconds) for nearest 1m candle — first pass (±15 min). */
export const METAAPI_HISTORY_MAX_CANDLE_DIFF_SECONDS = Number(
  process.env.METAAPI_HISTORY_MAX_CANDLE_DIFF_SECONDS ?? 3600,
);

/** Cooldown before retrying MetaAPI history for the same prediction. */
export const METAAPI_HISTORY_RETRY_COOLDOWN_MS = Number(
  process.env.METAAPI_HISTORY_RETRY_COOLDOWN_MS ?? 5 * 60 * 1000,
);

export const MISSING_EVENT_START_PRICE = 'MISSING_EVENT_START_PRICE';
