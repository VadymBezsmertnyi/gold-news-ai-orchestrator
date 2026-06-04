export const XAUUSD_SYMBOL = 'XAUUSD';
export const MOCK_GOLD_PRICE = 2650.5;
/** @deprecated Use forexfactory:indicator / forexfactory:news */
export const NEWS_SOURCE_FOREX_FACTORY = 'forexfactory';

export {
  NEWS_SOURCE_FOREX_FACTORY_INDICATOR,
  NEWS_SOURCE_FOREX_FACTORY_NEWS,
  FOREX_FACTORY_SOURCE_FILTER,
} from './modules/news/news-forexfactory.constants';

/** Max pending news analyzed per scheduler tick (keeps LLM cost low). */
export const ANALYSIS_BATCH_LIMIT = 2;

/** Demo-friendly prediction window when using mock LLM (minutes). */
export const MOCK_PREDICTION_TIMEFRAME_MINUTES = 1;
