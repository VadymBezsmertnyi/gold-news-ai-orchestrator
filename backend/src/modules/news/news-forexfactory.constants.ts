export const FF_BASE_URL = 'https://www.forexfactory.com';
export const FF_MDS_BASE_URL = 'https://mds-api.forexfactory.com';

/** Calendar upcoming (often 403 from datacenter IPs). XauSync name: NEWS_API_URL */
export const NEWS_CALENDAR_API_URL = `${FF_BASE_URL}/calendar/upcoming/instrument/GoldUSD?limit=100`;

/** @deprecated alias */
export const NEWS_API_URL = NEWS_CALENDAR_API_URL;

export const NEWS_SOURCE_FOREX_FACTORY_INDICATOR = 'forexfactory:indicator';
export const NEWS_SOURCE_FOREX_FACTORY_NEWS = 'forexfactory:news';

/** Legacy minimal headers (XauSync); prefer buildForexFactoryBrowserHeaders() + cookie. */
export const FOREX_FACTORY_HTTP_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: FF_BASE_URL,
} as const;

/** Legacy rows + both FF sub-sources for queries. */
export const FOREX_FACTORY_SOURCE_FILTER = {
  in: [
    'forexfactory',
    NEWS_SOURCE_FOREX_FACTORY_INDICATOR,
    NEWS_SOURCE_FOREX_FACTORY_NEWS,
  ],
} as const;

export const FOREX_FACTORY_NEWS_SOURCE_FILTER = {
  in: ['forexfactory', NEWS_SOURCE_FOREX_FACTORY_NEWS],
} as const;

export const FOREX_FACTORY_INDICATOR_SOURCE_FILTER = {
  in: [NEWS_SOURCE_FOREX_FACTORY_INDICATOR],
} as const;
