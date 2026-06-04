export enum NewsCategory {
  FED_RATES = 'FED_RATES',
  INFLATION = 'INFLATION',
  EMPLOYMENT = 'EMPLOYMENT',
  USD = 'USD',
  GEOPOLITICS = 'GEOPOLITICS',
  CENTRAL_BANK = 'CENTRAL_BANK',
  MARKET_SENTIMENT = 'MARKET_SENTIMENT',
  OTHER = 'OTHER',
}

export enum NewsImpactLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export type NewsClassifierInput = {
  title: string;
  summary?: string | null;
  source: string;
  publishedAt: Date;
};

export type NewsClassifierOutput = {
  category: NewsCategory;
  impactLevel: NewsImpactLevel;
  summary: string;
  reasoning: string;
};
