export interface MetaApiHistoricalPriceResult {
  price: number;
  bid?: number;
  ask?: number;
  time: Date;
  source: 'metaapi_history';
  timeDiffSeconds: number;
}

export interface MetaApiCandleLike {
  time?: Date | string | number;
  brokerTime?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume?: number;
}

export interface MetaApiHistoryFetchAttemptMeta {
  label: string;
  timeframe: string;
  metaApiStartTime: string;
  limit: number;
  maxDiffSeconds: number;
  rawCount: number;
  firstCandleTime: string | null;
  lastCandleTime: string | null;
  nearestCandleTime: string | null;
  nearestTimeDiffSeconds: number | null;
  picked: boolean;
  failReason?: string;
  price?: number;
  candleTimeIso?: string;
}

export interface MetaApiHistoryDebugPayload {
  requestedTime: string;
  symbol: string;
  method: 'MetatraderAccount.getHistoricalCandles';
  attempts: MetaApiHistoryFetchAttemptMeta[];
  accountId?: string;
  throttled?: boolean;
}

export interface MetaApiHistoricalPriceDebugResult {
  requestedTime: string;
  symbol: string;
  price: number | null;
  source: string | null;
  candleTime: string | null;
  timeDiffSeconds: number | null;
  rawCount: number;
  debug: MetaApiHistoryDebugPayload;
}
