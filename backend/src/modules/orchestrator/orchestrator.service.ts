import { Injectable, Logger } from '@nestjs/common';
import { NewsAnalysisStatus, PredictionStatus } from '@prisma/client';

// common
import { PrismaService } from '../../common/prisma/prisma.service';

// modules
import { AgentsService } from '../agents/agents.service';
import { LearningService } from '../learning/learning.service';
import { NewsService } from '../news/news.service';
import { PredictionsService } from '../predictions/predictions.service';
import { MarketService } from '../market/market.service';

// agents
import { NewsClassifierAgent } from '../ai/agents/news-classifier.agent';
import { SingleNewsImpactAgent } from '../ai/agents/single-news-impact.agent';
import { PredictionAgent } from '../ai/agents/prediction.agent';

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
  publishedAt: Date;
  analysisStatus: string;
  category: string | null;
  impactLevel: string | null;
  goldImpact: string | null;
  analysisSummary: string | null;
  analyzedAt: Date | null;
}

export interface DashboardResponse {
  stats: {
    totalNews: number;
    pendingPredictions: number;
    successfulPredictions: number;
    failedPredictions: number;
    pendingAnalysisNewsCount: number;
    analyzedNewsCount: number;
    failedAnalysisNewsCount: number;
  };
  recentPredictions: DashboardPredictionRow[];
  recentNews: DashboardNewsRow[];
  globalContext: Awaited<
    ReturnType<OrchestratorService['getGlobalContextPlaceholder']>
  >;
  learningRules: Awaited<ReturnType<LearningService['findAll']>>;
  orchestratorNote: string;
}

export interface PendingAnalysisPlaceholderResult {
  count: number;
  ids: string[];
  message: string;
}

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly newsService: NewsService,
    private readonly predictionsService: PredictionsService,
    private readonly learningService: LearningService,
    private readonly agentsService: AgentsService,
    private readonly newsClassifierAgent: NewsClassifierAgent,
    private readonly singleNewsImpactAgent: SingleNewsImpactAgent,
    private readonly predictionAgent: PredictionAgent,
    private readonly marketService: MarketService,
  ) {}

  async getDashboard(): Promise<DashboardResponse> {
    const [
      totalNews,
      pendingPredictions,
      successfulPredictions,
      failedPredictions,
      pendingAnalysisNewsCount,
      analyzedNewsCount,
      failedAnalysisNewsCount,
      recentPredictions,
      recentNews,
      learningRules,
      globalContext,
    ] = await Promise.all([
      this.newsService.count(),
      this.predictionsService.countByStatus(PredictionStatus.PENDING),
      this.predictionsService.countByStatus(PredictionStatus.SUCCESS),
      this.predictionsService.countByStatus(PredictionStatus.FAILED),
      this.newsService.countByAnalysisStatus(NewsAnalysisStatus.PENDING),
      this.newsService.countByAnalysisStatus(NewsAnalysisStatus.ANALYZED),
      this.newsService.countByAnalysisStatus(NewsAnalysisStatus.FAILED),
      this.predictionsService.findRecentForDashboard(15),
      this.newsService.findRecentForDashboard(10),
      this.learningService.findAll(),
      this.getGlobalContextPlaceholder(),
    ]);

    return {
      stats: {
        totalNews,
        pendingPredictions,
        successfulPredictions,
        failedPredictions,
        pendingAnalysisNewsCount,
        analyzedNewsCount,
        failedAnalysisNewsCount,
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
        result: p.result ? (p.result.isSuccess ? 'SUCCESS' : 'FAILED') : null,
      })),
      recentNews,
      globalContext,
      learningRules,
      orchestratorNote:
        'Background scheduler runs news sync (10m), analysis placeholder (1m), and prediction evaluation (1m). Claude agents not connected yet.',
    };
  }

  async analyzePendingNews(limit = 5) {
    const newsItems = await this.prisma.newsItem.findMany({
      where: {
        analysisStatus: 'PENDING',
      },
      orderBy: {
        publishedAt: 'desc',
      },
      take: limit,
    });
    const results = [];

    for (const newsItem of newsItems) {
      try {
        const output = await this.newsClassifierAgent.run({
          title: newsItem.title,
          summary: newsItem.summary,
          source: newsItem.source,
          publishedAt: newsItem.publishedAt,
        });

        const impactOutput = await this.singleNewsImpactAgent.run({
          title: newsItem.title,
          summary: output.summary,
          category: output.category,
          impactLevel: output.impactLevel,
          source: newsItem.source,
          publishedAt: newsItem.publishedAt,
        });

        const currentPrice = await this.marketService.getCurrentXauusd();
        const predictionOutput = await this.predictionAgent.run({
          title: newsItem.title,
          summary: output.summary,
          category: output.category,
          impactLevel: output.impactLevel,
          goldImpact: impactOutput.goldImpact,
          impactReason: impactOutput.impactReason,
          currentPrice: currentPrice.price,
          publishedAt: newsItem.publishedAt,
        });

        const updatedNewsItem = await this.prisma.newsItem.update({
          where: { id: newsItem.id },
          data: {
            category: output.category,
            impactLevel: output.impactLevel,
            goldImpact: impactOutput.goldImpact,
            analysisSummary: `
              ${output.summary}

              Impact Reason:
              ${impactOutput.impactReason}
              `.trim(),
            analysisStatus: 'ANALYZED',
            analyzedAt: new Date(),
            analysisError: null,
          },
        });

        const now = new Date();
        const checkAfter = new Date(
          now.getTime() + predictionOutput.timeframeMinutes * 60 * 1000,
        );
        await this.prisma.prediction.create({
          data: {
            newsItemId: updatedNewsItem.id,
            direction: predictionOutput.direction,
            confidence: predictionOutput.confidence,
            expectedMovePercent: predictionOutput.expectedMovePercent,
            timeframeMinutes: predictionOutput.timeframeMinutes,
            reason: predictionOutput.reason,
            status: 'PENDING',
            priceAtPrediction: currentPrice.price,
            checkAfter,
            sourceType: 'SINGLE_NEWS',
            validFrom: now,
            validUntil: checkAfter,
            expiresAt: checkAfter,
          },
        });

        results.push({
          id: updatedNewsItem.id,
          title: updatedNewsItem.title,
          category: updatedNewsItem.category,
          impactLevel: updatedNewsItem.impactLevel,
          goldImpact: updatedNewsItem.goldImpact,
          prediction: predictionOutput,
          priceAtPrediction: currentPrice.price,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown classifier error';

        await this.prisma.newsItem.update({
          where: {
            id: newsItem.id,
          },
          data: {
            analysisStatus: 'FAILED',
            analysisError: message,
          },
        });

        results.push({
          id: newsItem.id,
          title: newsItem.title,
          error: message,
        });
      }
    }

    return {
      count: results.length,
      results,
    };
  }

  /** Placeholder for GLOBAL_CONTEXT predictions — no AI calls. */
  async getGlobalContextPlaceholder() {
    const range = this.getNewsWindowRange();
    const [newsInWindow, latestStoredContext] = await Promise.all([
      this.prisma.newsItem.findMany({
        where: {
          publishedAt: {
            gte: range.newsWindowStart,
            lte: range.newsWindowEnd,
          },
        },
        orderBy: { publishedAt: 'asc' },
        take: 30,
        select: {
          id: true,
          title: true,
          publishedAt: true,
          analysisStatus: true,
        },
      }),
      this.prisma.marketContextAnalysis.findFirst({
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      placeholder: true,
      message:
        'Global market-context analysis not implemented. Use SINGLE_NEWS predictions for now.',
      newsWindow: {
        start: range.newsWindowStart,
        end: range.newsWindowEnd,
      },
      newsInWindowCount: newsInWindow.length,
      newsInWindow,
      latestStoredContext,
      suggestedGlobalBias: null,
      suggestedConfidence: null,
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

  private getNewsWindowRange() {
    const now = Date.now();
    const sixHoursMs = 6 * 60 * 60 * 1000;
    return {
      newsWindowStart: new Date(now - sixHoursMs),
      newsWindowEnd: new Date(now + sixHoursMs),
    };
  }
}
