import { Injectable, Logger } from '@nestjs/common';
import {
  NewsAnalysisStatus,
  PredictionSourceType,
  PredictionStatus,
} from '@prisma/client';

// common
import { PrismaService } from '../../common/prisma/prisma.service';
import { ANALYSIS_BATCH_LIMIT } from '../../constants';

// modules
import { AgentsService } from '../agents/agents.service';
import { LearningService } from '../learning/learning.service';
import { NewsService } from '../news/news.service';
import { PredictionsService } from '../predictions/predictions.service';
import { MarketService } from '../market/market.service';
import { MetaApiLivePriceService } from '../market/metaapi-live-price.service';
import { ServerLogsService } from '../server-logs/server-logs.service';

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
  priceAtPrediction: number | null;
  currentLivePrice: number | null;
  checkAfter: Date;
  priceBefore: number | null;
  priceAfter: number | null;
  result: string | null;
}

export interface DashboardMarketPrice {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  source: 'metaapi' | 'mock';
  connected: boolean;
  updatedAt: Date;
}

export interface DashboardMetaApiStatus {
  connected: boolean;
  synchronized: boolean;
  hasLivePrice: boolean;
  symbol: string;
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
  analysisSummaryPreview?: string | null;
  analyzedAt: Date | null;
}

export interface DashboardServerLogRow {
  id: string;
  type: string;
  message: string;
  level: string;
  meta: unknown;
  createdAt: Date;
}

export interface DashboardResponse {
  marketPrice: DashboardMarketPrice;
  metaApiStatus: DashboardMetaApiStatus;
  stats: {
    totalNews: number;
    pendingPredictions: number;
    successfulPredictions: number;
    failedPredictions: number;
    activePredictions: number;
    pendingAnalysisNewsCount: number;
    analyzedNewsCount: number;
    failedAnalysisNewsCount: number;
  };
  recentPredictions: DashboardPredictionRow[];
  recentNews: DashboardNewsRow[];
  recentServerLogs: DashboardServerLogRow[];
  lastNewsSyncAt: Date | null;
  globalContext: Awaited<
    ReturnType<OrchestratorService['getGlobalContextPlaceholder']>
  >;
  learningRules: Awaited<ReturnType<LearningService['findAll']>>;
  orchestratorNote: string;
}

export interface AnalyzePendingNewsResult {
  processed: number;
  analyzed: number;
  failed: number;
  predictionsCreated: number;
  predictionsSkipped: number;
  newsIds: string[];
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
    private readonly serverLogsService: ServerLogsService,
    private readonly newsClassifierAgent: NewsClassifierAgent,
    private readonly singleNewsImpactAgent: SingleNewsImpactAgent,
    private readonly predictionAgent: PredictionAgent,
    private readonly marketService: MarketService,
    private readonly metaApiLive: MetaApiLivePriceService,
  ) {}

  async getDashboard(): Promise<DashboardResponse> {
    const marketPrice = await this.marketService.getCurrentXauusd();
    const metaApiStatus = this.metaApiLive.getStatus();
    const livePrice =
      marketPrice.source === 'metaapi' ? marketPrice.price : null;

    const [
      totalNews,
      pendingPredictions,
      successfulPredictions,
      failedPredictions,
      activePredictions,
      pendingAnalysisNewsCount,
      analyzedNewsCount,
      failedAnalysisNewsCount,
      recentPredictions,
      recentNews,
      learningRules,
      globalContext,
      recentServerLogs,
      lastNewsSyncAt,
    ] = await Promise.all([
      this.newsService.count(),
      this.predictionsService.countByStatus(PredictionStatus.PENDING),
      this.predictionsService.countByStatus(PredictionStatus.SUCCESS),
      this.predictionsService.countByStatus(PredictionStatus.FAILED),
      this.predictionsService.countActivePredictions(),
      this.newsService.countByAnalysisStatus(NewsAnalysisStatus.PENDING),
      this.newsService.countByAnalysisStatus(NewsAnalysisStatus.ANALYZED),
      this.newsService.countByAnalysisStatus(NewsAnalysisStatus.FAILED),
      this.predictionsService.findRecentForDashboard(15),
      this.newsService.findRecentForDashboard(10),
      this.learningService.findAll(),
      this.getGlobalContextPlaceholder(),
      this.serverLogsService.findLatest(80),
      this.serverLogsService.getLastCompletedAt('news_sync'),
    ]);

    return {
      marketPrice,
      metaApiStatus,
      stats: {
        totalNews,
        pendingPredictions,
        successfulPredictions,
        failedPredictions,
        activePredictions,
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
        priceAtPrediction: p.priceAtPrediction,
        currentLivePrice: p.result?.priceAfter ?? livePrice,
        checkAfter: p.checkAfter,
        priceBefore: p.result?.priceBefore ?? p.priceAtPrediction,
        priceAfter: p.result?.priceAfter ?? null,
        result: p.result ? (p.result.isSuccess ? 'SUCCESS' : 'FAILED') : null,
      })),
      recentNews: (recentNews as DashboardNewsRow[]).map((row) => ({
        ...row,
        analysisSummaryPreview: row.analysisSummary
          ? row.analysisSummary.slice(0, 120) +
            (row.analysisSummary.length > 120 ? '…' : '')
          : null,
      })),
      recentServerLogs: recentServerLogs.map((log) => ({
        id: log.id,
        type: log.type,
        message: log.message,
        level: log.level,
        meta: log.meta,
        createdAt: log.createdAt,
      })),
      lastNewsSyncAt,
      globalContext,
      learningRules,
      orchestratorNote:
        'Live MetaAPI streaming + automatic news/analysis/evaluation. Dashboard refreshes every 10s.',
    };
  }

  async analyzePendingNews(
    limit = ANALYSIS_BATCH_LIMIT,
  ): Promise<AnalyzePendingNewsResult> {
    const newsItems = await this.newsService.findPendingAnalysis(limit);
    const summary: AnalyzePendingNewsResult = {
      processed: 0,
      analyzed: 0,
      failed: 0,
      predictionsCreated: 0,
      predictionsSkipped: 0,
      newsIds: [],
    };

    for (const newsItem of newsItems) {
      summary.processed++;
      summary.newsIds.push(newsItem.id);

      try {
        const classifierOutput = await this.newsClassifierAgent.run({
          title: newsItem.title,
          summary: newsItem.summary,
          source: newsItem.source,
          publishedAt: newsItem.publishedAt,
        });

        const impactOutput = await this.singleNewsImpactAgent.run({
          title: newsItem.title,
          summary: classifierOutput.summary,
          category: classifierOutput.category,
          impactLevel: classifierOutput.impactLevel,
          source: newsItem.source,
          publishedAt: newsItem.publishedAt,
        });

        const currentPrice = await this.marketService.getCurrentXauusd();
        const predictionOutput = await this.predictionAgent.run({
          title: newsItem.title,
          summary: classifierOutput.summary,
          category: classifierOutput.category,
          impactLevel: classifierOutput.impactLevel,
          goldImpact: impactOutput.goldImpact,
          impactReason: impactOutput.impactReason,
          currentPrice: currentPrice.price,
          publishedAt: newsItem.publishedAt,
        });

        await this.prisma.newsItem.update({
          where: { id: newsItem.id },
          data: {
            category: classifierOutput.category,
            impactLevel: classifierOutput.impactLevel,
            goldImpact: impactOutput.goldImpact,
            analysisSummary: [
              classifierOutput.summary,
              `Impact: ${impactOutput.impactReason}`,
            ].join('\n\n'),
            analysisStatus: NewsAnalysisStatus.ANALYZED,
            analyzedAt: new Date(),
            analysisError: null,
          },
        });

        summary.analyzed++;

        const hasActive =
          await this.predictionsService.hasActiveSingleNewsPrediction(
            newsItem.id,
          );
        if (hasActive) {
          summary.predictionsSkipped++;
          continue;
        }

        const now = new Date();
        const checkAfter = new Date(
          now.getTime() + predictionOutput.timeframeMinutes * 60 * 1000,
        );

        await this.prisma.prediction.create({
          data: {
            newsItemId: newsItem.id,
            direction: predictionOutput.direction,
            confidence: predictionOutput.confidence,
            expectedMovePercent: predictionOutput.expectedMovePercent,
            timeframeMinutes: predictionOutput.timeframeMinutes,
            reason: predictionOutput.reason,
            status: PredictionStatus.PENDING,
            priceAtPrediction: currentPrice.price,
            checkAfter,
            sourceType: PredictionSourceType.SINGLE_NEWS,
            validFrom: now,
            validUntil: checkAfter,
            expiresAt: checkAfter,
          },
        });
        summary.predictionsCreated++;
      } catch (error) {
        summary.failed++;
        const message =
          error instanceof Error ? error.message : 'Unknown analysis error';

        await this.prisma.newsItem.update({
          where: { id: newsItem.id },
          data: {
            analysisStatus: NewsAnalysisStatus.FAILED,
            analysisError: message,
          },
        });

        this.logger.warn(`Analysis failed for news ${newsItem.id}: ${message}`);
      }
    }

    return summary;
  }

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
