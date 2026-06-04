export interface DashboardStats {
  totalNews: number;
  pendingPredictions: number;
  successfulPredictions: number;
  failedPredictions: number;
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
  learningRules: LearningRule[];
  orchestratorNote: string;
}
