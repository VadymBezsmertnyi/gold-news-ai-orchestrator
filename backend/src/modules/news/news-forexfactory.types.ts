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
  afterDateWindow: number;
  afterDedup: number;
  timeWindow: SyncTimeWindow;
  impactBreakdown: ImpactBreakdown;
  events: ForexFactoryNewsEvent[];
  rawMerged: ForexFactoryNewsEvent[];
}

export interface SyncNewsResult {
  fetchedRaw: number;
  afterDateWindow: number;
  afterDedup: number;
  created: number;
  updated: number;
  skipped: number;
  source: string;
  impactBreakdown: ImpactBreakdown;
  timeWindow: SyncTimeWindow;
}

export interface NewsDebugSourceResult {
  timeWindow: SyncTimeWindow;
  rawFromApi: {
    calendar: number;
    indicators: number;
    merged: number;
    afterDateWindow: number;
    afterDedup: number;
  };
  impactBreakdown: ImpactBreakdown;
  database: {
    totalForexFactory: number;
    inTimeWindow: number;
  };
  samples: {
    raw: ForexFactoryNewsEvent[];
    mapped: Array<Record<string, unknown>>;
  };
}
