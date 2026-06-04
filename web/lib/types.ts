export interface DashboardMarketPrice {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  source: 'metaapi' | 'mock';
  connected: boolean;
  updatedAt: string;
}

export interface DashboardMetaApiStatus {
  connected: boolean;
  synchronized: boolean;
  hasLivePrice: boolean;
  symbol: string;
}

export interface DashboardStats {
  totalNews: number;
  pendingPredictions: number;
  successfulPredictions: number;
  failedPredictions: number;
  activePredictions: number;
  pendingAnalysisNewsCount: number;
  analyzedNewsCount: number;
  failedAnalysisNewsCount: number;
}

export interface DashboardPredictionRow {
  id: string;
  newsTitle: string;
  direction: string;
  confidence: number;
  expectedMovePercent: number | null;
  timeframeMinutes: number;
  status: string;
  priceAtPrediction: number | null;
  currentLivePrice: number | null;
  checkAfter: string;
  priceBefore: number | null;
  priceAfter: number | null;
  result: string | null;
}

export interface DashboardNewsRow {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  analysisStatus: string;
  category: string | null;
  impactLevel: string | null;
  goldImpact: string | null;
  analysisSummary: string | null;
  analysisSummaryPreview?: string | null;
  analyzedAt: string | null;
}

export interface DashboardServerLogRow {
  id: string;
  type: string;
  message: string;
  level: string;
  meta: unknown;
  createdAt: string;
}

export interface GlobalContextPlaceholder {
  placeholder: boolean;
  message: string;
  newsWindow: { start: string; end: string };
  newsInWindowCount: number;
  newsInWindow: Array<{
    id: string;
    title: string;
    publishedAt: string;
    analysisStatus: string;
  }>;
  latestStoredContext: unknown;
  suggestedGlobalBias: string | null;
  suggestedConfidence: number | null;
}

export interface LearningRule {
  id: string;
  title: string;
  description: string;
  sourcePredictionId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardResponse {
  marketPrice: DashboardMarketPrice;
  metaApiStatus: DashboardMetaApiStatus;
  stats: DashboardStats;
  recentPredictions: DashboardPredictionRow[];
  recentNews: DashboardNewsRow[];
  recentServerLogs: DashboardServerLogRow[];
  lastNewsSyncAt: string | null;
  globalContext: GlobalContextPlaceholder;
  learningRules: LearningRule[];
  orchestratorNote: string;
}
