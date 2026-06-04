export interface ForexFactoryNewsEvent {
  idApi?: string;
  id?: number | string;
  title: string;
  impact?: string;
  impact_name?: string;
  impact_value: number;
  dateline: number;
  country?: string;
  date?: string;
  time?: string;
  forecast?: string;
  previous?: string;
  details_url?: string;
}

export interface NewsApiResponse {
  events: ForexFactoryNewsEvent[];
  has_more?: boolean;
}

export interface IndicatorsApiItem {
  id: number | string;
  title: string;
  impact_value: number;
  timestamp: number;
  country?: string;
  impact?: string;
  url?: string;
}

export interface IndicatorsApiResponse {
  data: IndicatorsApiItem[];
}

export interface SyncTimeWindow {
  from: string;
  to: string;
  fromSec: number;
  toSec: number;
}

export interface ImpactBreakdown {
  high: number;
  medium: number;
  low: number;
  other: number;
}

export interface ForexFactoryFetchResult {
  calendarRaw: number;
  indicatorsRaw: number;
  fetchedRaw: number;
  afterWindow: number;
  afterDedup: number;
  timeWindow: SyncTimeWindow;
  impactBreakdown: ImpactBreakdown;
  events: ForexFactoryNewsEvent[];
  rawMerged: ForexFactoryNewsEvent[];
}

export interface SyncNewsResult {
  fetchedRaw: number;
  afterWindow: number;
  afterDedup: number;
  created: number;
  updated: number;
  skipped: number;
  pruned: {
    newsItems: number;
    predictions: number;
    predictionResults: number;
  };
  source: string;
  impactBreakdown: ImpactBreakdown;
  timeWindow: SyncTimeWindow;
}

export interface NewsDebugSourceResult {
  now: string;
  from: string;
  to: string;
  rawCount: number;
  afterWindowCount: number;
  afterDedupCount: number;
  savedCount: number;
  oldestSavedEventStartAt: string | null;
  newestSavedEventStartAt: string | null;
  timeWindow: SyncTimeWindow;
  syncPastHours: number;
  syncFutureHours: number;
  rawFromApi: {
    calendar: number;
    indicators: number;
  };
  impactBreakdown: ImpactBreakdown;
  samples: {
    raw: ForexFactoryNewsEvent[];
    mapped: Array<Record<string, unknown>>;
  };
}
