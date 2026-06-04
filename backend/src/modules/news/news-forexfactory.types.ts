export type ForexFactorySourceType = 'INDICATOR' | 'NEWS';

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
  forexFactoryType: ForexFactorySourceType;
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

export interface SourceFetchSlice {
  raw: number;
  afterWindow: number;
  afterDedup: number;
  events: ForexFactoryNewsEvent[];
  rawInWindow: ForexFactoryNewsEvent[];
}

export interface ForexFactoryFetchResult {
  timeWindow: SyncTimeWindow;
  indicatorsUrl: string;
  newsUrl: string;
  indicators: SourceFetchSlice;
  news: SourceFetchSlice;
  total: {
    raw: number;
    afterWindow: number;
    afterDedup: number;
  };
  impactBreakdown: ImpactBreakdown;
  events: ForexFactoryNewsEvent[];
}

export interface SourceSyncStats {
  raw: number;
  afterWindow: number;
  created: number;
  updated: number;
  skipped: number;
}

export interface SyncNewsResult {
  timeWindow: SyncTimeWindow;
  indicators: SourceSyncStats;
  news: SourceSyncStats;
  total: SourceSyncStats & { afterDedup: number };
  impactBreakdown: ImpactBreakdown;
}

export interface NewsDebugSourceResult {
  now: string;
  timeWindow: SyncTimeWindow;
  syncPastHours: number;
  syncFutureHours: number;
  indicatorsUrl: string;
  newsUrl: string;
  indicators: {
    rawCount: number;
    afterWindowCount: number;
    afterDedupCount: number;
  };
  news: {
    rawCount: number;
    afterWindowCount: number;
    afterDedupCount: number;
  };
  mergedCount: number;
  savedCount: number;
  oldestSavedEventStartAt: string | null;
  newestSavedEventStartAt: string | null;
  impactBreakdown: ImpactBreakdown;
  samples: {
    indicators: Array<Record<string, unknown>>;
    news: Array<Record<string, unknown>>;
  };
}
