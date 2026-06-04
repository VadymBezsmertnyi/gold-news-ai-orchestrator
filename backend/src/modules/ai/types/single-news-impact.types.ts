export enum GoldImpactDirection {
  BULLISH = 'BULLISH',
  BEARISH = 'BEARISH',
  NEUTRAL = 'NEUTRAL',
}

export enum ExpectedVolatility {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export type SingleNewsImpactInput = {
  title: string;
  summary?: string | null;
  category?: string | null;
  impactLevel?: string | null;
  source: string;
  publishedAt: Date;
};

export type SingleNewsImpactOutput = {
  goldImpact: GoldImpactDirection;
  expectedVolatility: ExpectedVolatility;
  impactReason: string;
  keyDrivers: string[];
};
