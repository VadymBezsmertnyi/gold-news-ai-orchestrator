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

export interface SyncNewsResult {
  fetched: number;
  created: number;
  skipped: number;
  source: string;
}
