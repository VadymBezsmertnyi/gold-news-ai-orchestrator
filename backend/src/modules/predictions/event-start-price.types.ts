export type EventStartBaselineSource =
  | 'priceAtEventStart'
  | 'live_at_event_start'
  | 'metaapi_history'
  | 'snapshot_before'
  | 'snapshot_after'
  | 'priceAtPrediction'
  | 'missing';

export interface EventStartPriceResolution {
  price: number | null;
  source: EventStartBaselineSource;
  time?: Date;
  timeDiffSeconds?: number;
  reason?: string;
}
