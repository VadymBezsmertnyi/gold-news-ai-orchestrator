/** Live capture window around eventStartAt (seconds). */
export const EVENT_START_CAPTURE_WINDOW_SECONDS = Number(
  process.env.EVENT_START_CAPTURE_WINDOW_SECONDS ?? 30,
);

/** Max predictions to backfill per capture job run. */
export const EVENT_START_CAPTURE_BATCH_LIMIT = Number(
  process.env.EVENT_START_CAPTURE_BATCH_LIMIT ?? 10,
);

/** Max age (seconds) for nearest 1m candle vs eventStartAt. */
export const METAAPI_HISTORY_MAX_CANDLE_DIFF_SECONDS = Number(
  process.env.METAAPI_HISTORY_MAX_CANDLE_DIFF_SECONDS ?? 900,
);

export const MISSING_EVENT_START_PRICE = 'MISSING_EVENT_START_PRICE';
