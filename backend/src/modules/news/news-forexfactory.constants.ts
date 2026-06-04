export const FF_BASE_URL = 'https://www.forexfactory.com';
export const NEWS_API_URL = `${FF_BASE_URL}/calendar/upcoming/instrument/GoldUSD?limit=100`;

export const NEWS_SOURCE_FOREX_FACTORY_INDICATOR = 'forexfactory:indicator';
export const NEWS_SOURCE_FOREX_FACTORY_NEWS = 'forexfactory:news';

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
