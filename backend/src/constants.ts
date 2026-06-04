export const XAUUSD_SYMBOL = 'XAUUSD';
export const MOCK_GOLD_PRICE = 2650.5;
export const NEWS_SOURCE_FOREX_FACTORY = 'forexfactory';

/** Max pending news analyzed per scheduler tick (keeps LLM cost low). */
export const ANALYSIS_BATCH_LIMIT = 2;

/** Demo-friendly prediction window when using mock LLM (minutes). */
export const MOCK_PREDICTION_TIMEFRAME_MINUTES = 1;
