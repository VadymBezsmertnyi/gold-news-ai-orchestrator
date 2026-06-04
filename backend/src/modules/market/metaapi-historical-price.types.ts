export interface MetaApiHistoricalPriceResult {
  price: number;
  bid?: number;
  ask?: number;
  time: Date;
  source: 'metaapi_history';
  timeDiffSeconds: number;
}

export interface MetaApiCandleLike {
  time: Date | string;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume?: number;
}
