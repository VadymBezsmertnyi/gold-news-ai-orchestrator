export interface DashboardStats {
  totalNews: number;
  pendingPredictions: number;
  successfulPredictions: number;
  failedPredictions: number;
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
  analyzedAt: string | null;
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
  stats: DashboardStats;
  recentPredictions: DashboardPredictionRow[];
  recentNews: DashboardNewsRow[];
  globalContext: GlobalContextPlaceholder;
  learningRules: LearningRule[];
  orchestratorNote: string;
}
