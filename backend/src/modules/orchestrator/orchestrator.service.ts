import { Injectable } from '@nestjs/common';
import { PredictionStatus } from '@prisma/client';

// modules
import { AgentsService } from '../agents/agents.service';
import { LearningService } from '../learning/learning.service';
import { NewsService } from '../news/news.service';
import { PredictionsService } from '../predictions/predictions.service';

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

export interface DashboardResponse {
  stats: {
    totalNews: number;
    pendingPredictions: number;
    successfulPredictions: number;
    failedPredictions: number;
  };
  recentPredictions: DashboardPredictionRow[];
  learningRules: Awaited<ReturnType<LearningService['findAll']>>;
  orchestratorNote: string;
}

@Injectable()
export class OrchestratorService {
  constructor(
    private readonly newsService: NewsService,
    private readonly predictionsService: PredictionsService,
    private readonly learningService: LearningService,
    private readonly agentsService: AgentsService,
  ) {}

  async getDashboard(): Promise<DashboardResponse> {
    const [
      totalNews,
      pendingPredictions,
      successfulPredictions,
      failedPredictions,
      recentPredictions,
      learningRules,
    ] = await Promise.all([
      this.newsService.count(),
      this.predictionsService.countByStatus(PredictionStatus.PENDING),
      this.predictionsService.countByStatus(PredictionStatus.SUCCESS),
      this.predictionsService.countByStatus(PredictionStatus.FAILED),
      this.predictionsService.findRecentForDashboard(15),
      this.learningService.findAll(),
    ]);

    return {
      stats: {
        totalNews,
        pendingPredictions,
        successfulPredictions,
        failedPredictions,
      },
      recentPredictions: recentPredictions.map((p) => ({
        id: p.id,
        newsTitle: p.newsItem.title,
        direction: p.direction,
        confidence: p.confidence,
        expectedMovePercent: p.expectedMovePercent,
        timeframeMinutes: p.timeframeMinutes,
        status: p.status,
        priceBefore: p.result?.priceBefore ?? p.priceAtPrediction,
        priceAfter: p.result?.priceAfter ?? null,
        result: p.result
          ? p.result.isSuccess
            ? 'SUCCESS'
            : 'FAILED'
          : null,
      })),
      learningRules,
      orchestratorNote:
        'Claude orchestrator is not connected yet. Use mock endpoints to seed and evaluate data.',
    };
  }

  /** Reserved for future pipeline entry — no AI calls yet. */
  async runPipelineStub(): Promise<{ message: string }> {
    await this.agentsService.recordPlaceholderRun('orchestrator-stub', {
      step: 'dashboard-only',
    });
    return {
      message:
        'Pipeline stub recorded. Implement Claude orchestrator manually in agents module.',
    };
  }
}
