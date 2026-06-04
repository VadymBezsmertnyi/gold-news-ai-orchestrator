export interface DashboardMarketPrice {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  source: "metaapi" | "mock";
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
  sourceType: "SINGLE_NEWS" | "GLOBAL_CONTEXT" | string;
  direction: string;
  confidence: number;
  expectedMovePercent: number | null;
  timeframeMinutes: number;
  status: string;
  isOverdue: boolean;
  priceAtPrediction: number | null;
  currentLivePrice: number | null;
  deltaPercent: number | null;
  expectedResult: "SUCCESS" | "FAILED" | null;
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

export interface DashboardGlobalContext {
  id: string;
  globalBias: string;
  confidence: number;
  summary: string;
  activeDrivers: string[];
  riskNotes: string[];
  createdAt: string;
}

export interface DashboardPromptImprovement {
  id: string;
  problemType: string;
  rootCause: string;
  promptImprovement: string;
  confidence: number | null;
  sourcePredictionId: string | null;
  createdAt: string;
}

export interface DashboardDeprecatedLearningRule {
  id: string;
  title: string | null;
  description: string | null;
  createdAt: string;
}

export interface DashboardResponse {
  marketPrice: DashboardMarketPrice;
  metaApiStatus: DashboardMetaApiStatus;
  stats: DashboardStats;
  recentPredictions: DashboardPredictionRow[];
  recentNews: DashboardNewsRow[];
  recentServerLogs: DashboardServerLogRow[];
  lastNewsSyncAt: string | null;
  globalContext: DashboardGlobalContext | null;
  promptImprovements: DashboardPromptImprovement[];
  deprecatedLearningRules: DashboardDeprecatedLearningRule[];
  orchestratorNote: string;
}
