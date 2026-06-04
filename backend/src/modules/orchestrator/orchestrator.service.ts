import { Injectable, Logger } from '@nestjs/common';
import {
  NewsAnalysisStatus,
  PredictionDirection,
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
import { SERVER_LOG_TYPES } from '../server-logs/server-logs.constants';

// agents
import { NewsClassifierAgent } from '../ai/agents/news-classifier.agent';
import { SingleNewsImpactAgent } from '../ai/agents/single-news-impact.agent';
import { PredictionAgent } from '../ai/agents/prediction.agent';
import { GlobalMarketContextAgent } from '../ai/agents/global-market-context.agent';
export type GlobalContextTrigger =
  | 'HIGH_IMPACT_NEWS'
  | 'IMPORTANT_PREDICTION_RESULT'
  | 'SCHEDULED_30M'
  | 'MANUAL';

export interface DashboardPredictionRow {
  id: string;
  newsTitle: string;
  sourceType: string;
  direction: string;
  confidence: number;
  expectedMovePercent: number | null;
  timeframeMinutes: number;
  status: string;
  isOverdue: boolean;
  eventStartAt: Date | null;
  eventEndAt: Date | null;
  priceAtPrediction: number | null;
  priceAtEventStart: number | null;
  baselineSource: string | null;
  baselinePriceTime: Date | null;
  baselineTimeDiffSeconds: number | null;
  missingEventStartPrice: boolean;
  currentLivePrice: number | null;
  actualMovePercent: number | null;
  moveAccuracyPercent: number | null;
  finalScore: number | null;
  directionCorrect: boolean | null;
  isPreview: boolean;
  previewOutcome: 'SUCCESS' | 'FAILED' | null;
  checkAfter: Date;
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

export interface DashboardGlobalContext {
  id: string;
  globalBias: string;
  confidence: number;
  summary: string;
  activeDrivers: string[];
  riskNotes: string[];
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
  globalContext: DashboardGlobalContext | null;
  promptImprovements: DashboardPromptImprovement[];
  deprecatedLearningRules: DashboardDeprecatedLearningRule[];
  orchestratorNote: string;
}

export interface DashboardPromptImprovement {
  id: string;
  problemType: string;
  rootCause: string;
  promptImprovement: string;
  confidence: number | null;
  sourcePredictionId: string | null;
  createdAt: Date;
}

export interface DashboardDeprecatedLearningRule {
  id: string;
  title: string | null;
  description: string | null;
  createdAt: Date;
}

export interface AnalyzePendingNewsResult {
  processed: number;
  analyzed: number;
  failed: number;
  predictionsCreated: number;
  predictionsSkipped: number;
  newsIds: string[];
}

export interface RunGlobalContextResult {
  skipped: boolean;
  reason?: string;
  analysisId?: string;
  predictionId?: string;
}

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);
  private lastEventGlobalContextAt = 0;
  private lastGlobalContextRunAt = 0;
  private globalContextInFlight: Promise<RunGlobalContextResult> | null = null;

  private readonly eventCooldownMs =
    Number(process.env.GLOBAL_CONTEXT_COOLDOWN_MINUTES ?? 10) * 60 * 1000;
  private readonly scheduleIntervalMs =
    Number(process.env.GLOBAL_CONTEXT_SCHEDULE_MINUTES ?? 30) * 60 * 1000;
  private readonly predictionStaleMs = 30 * 60 * 1000;

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
    private readonly globalMarketContextAgent: GlobalMarketContextAgent,
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
      promptImprovementRows,
      deprecatedLearningRules,
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
      this.learningService.findActivePromptImprovements(),
      this.learningService.findDeprecated(),
      this.getLatestGlobalContext(),
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
      recentPredictions: recentPredictions.map((p) => {
        const now = new Date();
        const metrics = this.predictionsService.computeDashboardMetrics(
          p,
          livePrice,
        );
        const isOverdue =
          p.status === PredictionStatus.PENDING &&
          !p.result &&
          p.checkAfter <= now;

        return {
          id: p.id,
          newsTitle:
            p.sourceType === PredictionSourceType.GLOBAL_CONTEXT
              ? 'Глобальний контекст ринку'
              : (p.newsItem?.title ?? '—'),
          sourceType: p.sourceType,
          direction: p.direction,
          confidence: p.confidence,
          expectedMovePercent: p.expectedMovePercent,
          timeframeMinutes: p.timeframeMinutes,
          status: p.status,
          isOverdue,
          eventStartAt: p.eventStartAt ?? p.newsItem?.eventStartAt ?? null,
          eventEndAt: p.eventEndAt ?? p.checkAfter,
          priceAtPrediction: p.priceAtPrediction,
          priceAtEventStart: metrics?.baseline ?? p.priceAtEventStart ?? null,
          baselineSource:
            metrics?.baselineSource ?? p.result?.baselineSource ?? null,
          baselinePriceTime: metrics?.baselinePriceTime ?? null,
          baselineTimeDiffSeconds: metrics?.baselineTimeDiffSeconds ?? null,
          missingEventStartPrice: metrics?.missingEventStartPrice ?? false,
          currentLivePrice: metrics?.priceAfter ?? livePrice,
          actualMovePercent: metrics?.actualMovePercent ?? null,
          moveAccuracyPercent: metrics?.moveAccuracyPercent ?? null,
          finalScore: p.result?.finalScore ?? metrics?.finalScore ?? null,
          directionCorrect:
            p.result?.directionCorrect ?? metrics?.directionCorrect ?? null,
          isPreview: metrics?.isPreview ?? false,
          previewOutcome:
            metrics?.previewOutcome === 'SUCCESS' ||
            metrics?.previewOutcome === 'FAILED'
              ? metrics.previewOutcome
              : null,
          checkAfter: p.checkAfter,
          result: p.result ? (p.result.isSuccess ? 'SUCCESS' : 'FAILED') : null,
        };
      }),
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
      promptImprovements: promptImprovementRows.map((r) => ({
        id: r.id,
        problemType: r.problemType ?? '',
        rootCause: r.rootCause ?? '',
        promptImprovement: r.promptImprovement ?? '',
        confidence: r.confidence,
        sourcePredictionId: r.sourcePredictionId,
        createdAt: r.createdAt,
      })),
      deprecatedLearningRules: deprecatedLearningRules.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        createdAt: r.createdAt,
      })),
      orchestratorNote:
        'Live MetaAPI + news/analysis/evaluation + global context (30m) + prompt improvements on failures.',
    };
  }

  async getLatestGlobalContext(): Promise<DashboardGlobalContext | null> {
    const row = await this.prisma.marketContextAnalysis.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    if (!row) return null;

    return {
      id: row.id,
      globalBias: row.globalBias,
      confidence: row.confidence,
      summary: row.summary,
      activeDrivers: this.parseStringArray(row.activeDrivers),
      riskNotes: this.parseStringArray(row.riskNotes),
      createdAt: row.createdAt,
    };
  }

  async runGlobalMarketContextAnalysis(
    trigger: GlobalContextTrigger,
  ): Promise<RunGlobalContextResult> {
    if (this.globalContextInFlight) return this.globalContextInFlight;

    this.globalContextInFlight = this.executeGlobalMarketContext(trigger);
    try {
      return await this.globalContextInFlight;
    } finally {
      this.globalContextInFlight = null;
    }
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

    const activeImprovementRows =
      await this.learningService.findActivePromptImprovements();
    const promptImprovements =
      this.learningService.toPromptImprovementSlices(activeImprovementRows);
    const appliedImprovementIds = promptImprovements.map((p) => p.id);

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
          promptImprovements,
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

        if (classifierOutput.impactLevel === 'HIGH') {
          void this.runGlobalMarketContextAnalysis('HIGH_IMPACT_NEWS').catch(
            (err) =>
              this.logger.warn('Global context after HIGH news failed', err),
          );
        }

        const hasActive =
          await this.predictionsService.hasActiveSingleNewsPrediction(
            newsItem.id,
          );
        if (hasActive) {
          summary.predictionsSkipped++;
          continue;
        }

        const eventStartAt = newsItem.eventStartAt ?? newsItem.publishedAt;
        const eventEndAt = new Date(
          eventStartAt.getTime() +
            predictionOutput.timeframeMinutes * 60 * 1000,
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
            eventStartAt,
            eventEndAt,
            checkAfter: eventEndAt,
            sourceType: PredictionSourceType.SINGLE_NEWS,
            validFrom: eventStartAt,
            validUntil: eventEndAt,
            expiresAt: eventEndAt,
            appliedPromptImprovementIds: appliedImprovementIds,
          },
        });
        await this.learningService.recordApplications(appliedImprovementIds);
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

  async runPipelineStub(): Promise<{ message: string }> {
    await this.agentsService.recordPlaceholderRun('orchestrator-stub', {
      step: 'dashboard-only',
    });
    return {
      message:
        'Pipeline stub recorded. Implement Claude orchestrator manually in agents module.',
    };
  }

  private async executeGlobalMarketContext(
    trigger: GlobalContextTrigger,
  ): Promise<RunGlobalContextResult> {
    const now = Date.now();
    const isScheduled = trigger === 'SCHEDULED_30M';
    const isEventTrigger =
      trigger === 'HIGH_IMPACT_NEWS' ||
      trigger === 'IMPORTANT_PREDICTION_RESULT';

    if (isEventTrigger) {
      if (now - this.lastEventGlobalContextAt < this.eventCooldownMs) {
        await this.logGlobalSkipped(trigger, 'event_cooldown');
        return { skipped: true, reason: 'event_cooldown' };
      }
    } else if (isScheduled) {
      if (now - this.lastGlobalContextRunAt < this.scheduleIntervalMs) {
        await this.logGlobalSkipped(trigger, 'schedule_interval');
        return { skipped: true, reason: 'schedule_interval' };
      }
    }

    await this.serverLogsService.info(
      SERVER_LOG_TYPES.GLOBAL_CONTEXT_STARTED,
      `Global market context started (${trigger})`,
      { trigger },
    );

    try {
      const currentPrice = await this.marketService.getCurrentXauusd();
      const input = await this.collectGlobalContextInput(currentPrice.price);
      const output = await this.globalMarketContextAgent.run(input);

      const window = this.getTwelveHourWindows();
      const analysis = await this.prisma.marketContextAnalysis.create({
        data: {
          globalBias: output.globalBias,
          confidence: output.confidence,
          summary: output.summary,
          activeDrivers: output.activeDrivers,
          riskNotes: output.riskNotes,
          newsWindowStart: window.pastStart,
          newsWindowEnd: window.upcomingEnd,
        },
      });

      this.lastGlobalContextRunAt = Date.now();
      if (isEventTrigger) this.lastEventGlobalContextAt = Date.now();

      const shouldCreate = await this.shouldCreateGlobalContextPrediction(
        trigger,
        output.globalBias,
      );

      if (!shouldCreate) {
        await this.serverLogsService.info(
          SERVER_LOG_TYPES.GLOBAL_CONTEXT_SKIPPED,
          'Global context analysis saved; prediction skipped',
          { trigger, analysisId: analysis.id },
        );
        return {
          skipped: true,
          reason: 'prediction_rules',
          analysisId: analysis.id,
        };
      }

      const anchorNewsId =
        input.pastNews[0]?.id ?? input.upcomingNews[0]?.id ?? null;
      const checkAt = new Date(
        Date.now() + output.timeframeMinutes * 60 * 1000,
      );
      const validUntil = checkAt;

      const globalAppliedIds = input.promptImprovements.map((p) => p.id);
      const prediction = await this.prisma.prediction.create({
        data: {
          newsItemId: anchorNewsId,
          direction: output.globalBias,
          confidence: output.confidence,
          expectedMovePercent: output.expectedMovePercent,
          timeframeMinutes: output.timeframeMinutes,
          reason: output.summary,
          status: PredictionStatus.PENDING,
          sourceType: PredictionSourceType.GLOBAL_CONTEXT,
          globalContextId: analysis.id,
          priceAtPrediction: currentPrice.price,
          checkAfter: checkAt,
          validFrom: new Date(),
          validUntil,
          expiresAt: validUntil,
          appliedPromptImprovementIds: globalAppliedIds,
        },
      });
      await this.learningService.recordApplications(globalAppliedIds);

      await this.serverLogsService.info(
        SERVER_LOG_TYPES.GLOBAL_CONTEXT_COMPLETED,
        'Global market context completed',
        {
          trigger,
          analysisId: analysis.id,
          predictionId: prediction.id,
          globalBias: output.globalBias,
        },
      );

      return {
        skipped: false,
        analysisId: analysis.id,
        predictionId: prediction.id,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown global context error';
      await this.serverLogsService.error(
        SERVER_LOG_TYPES.GLOBAL_CONTEXT_ERROR,
        `Global market context failed: ${message}`,
        { trigger },
      );
      this.logger.error('Global market context failed', error);
      throw error;
    }
  }

  private async shouldCreateGlobalContextPrediction(
    trigger: GlobalContextTrigger,
    _bias: PredictionDirection,
  ): Promise<boolean> {
    if (trigger === 'HIGH_IMPACT_NEWS' || trigger === 'MANUAL') return true;

    const active = await this.prisma.prediction.findFirst({
      where: {
        sourceType: PredictionSourceType.GLOBAL_CONTEXT,
        status: PredictionStatus.PENDING,
        result: { is: null },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!active) return true;

    const lastGlobal = await this.prisma.prediction.findFirst({
      where: { sourceType: PredictionSourceType.GLOBAL_CONTEXT },
      orderBy: { createdAt: 'desc' },
    });
    if (!lastGlobal) return true;

    const age = Date.now() - lastGlobal.createdAt.getTime();
    return age >= this.predictionStaleMs;
  }

  private async collectGlobalContextInput(currentPrice: number) {
    const { pastStart, now, upcomingEnd } = this.getTwelveHourWindows();

    const [
      pastNews,
      upcomingNews,
      activePredictions,
      recentResults,
      promptImprovementRows,
    ] = await Promise.all([
      this.prisma.newsItem.findMany({
        where: {
          analysisStatus: NewsAnalysisStatus.ANALYZED,
          publishedAt: { gte: pastStart, lte: now },
        },
        orderBy: { publishedAt: 'desc' },
        take: 25,
      }),
      this.prisma.newsItem.findMany({
        where: {
          publishedAt: { gt: now, lte: upcomingEnd },
        },
        orderBy: { publishedAt: 'asc' },
        take: 25,
      }),
      this.prisma.prediction.findMany({
        where: {
          status: PredictionStatus.PENDING,
          result: { is: null },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.predictionResult.findMany({
        where: {
          evaluatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        orderBy: { evaluatedAt: 'desc' },
        take: 15,
        include: {
          prediction: { include: { newsItem: true } },
        },
      }),
      this.learningService.findActivePromptImprovements(),
    ]);

    const promptImprovements = this.learningService.toPromptImprovementSlices(
      promptImprovementRows,
    );

    return {
      currentPrice,
      pastNews: pastNews.map((n) => ({
        id: n.id,
        title: n.title,
        publishedAt: n.publishedAt,
        category: n.category,
        impactLevel: n.impactLevel,
        goldImpact: n.goldImpact,
        analysisSummary: n.analysisSummary,
      })),
      upcomingNews: upcomingNews.map((n) => ({
        id: n.id,
        title: n.title,
        publishedAt: n.publishedAt,
        category: n.category,
        impactLevel: n.impactLevel,
        goldImpact: n.goldImpact,
        analysisSummary: n.analysisSummary,
      })),
      activePredictions: activePredictions.map((p) => ({
        id: p.id,
        sourceType: p.sourceType,
        direction: p.direction,
        confidence: p.confidence,
        status: p.status,
        reason: p.reason,
        createdAt: p.createdAt,
      })),
      recentResults: recentResults.map((r) => ({
        predictionId: r.predictionId,
        isSuccess: r.isSuccess,
        actualMovePercent: r.actualMovePercent,
        evaluatedAt: r.evaluatedAt,
        predictionDirection: r.prediction.direction,
        newsTitle: r.prediction.newsItem?.title ?? null,
      })),
      promptImprovements,
    };
  }

  private async logGlobalSkipped(
    trigger: GlobalContextTrigger,
    reason: string,
  ): Promise<void> {
    await this.serverLogsService.info(
      SERVER_LOG_TYPES.GLOBAL_CONTEXT_SKIPPED,
      `Global market context skipped (${reason})`,
      { trigger, reason },
    );
  }

  private getTwelveHourWindows() {
    const now = new Date();
    const pastStart = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    const upcomingEnd = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    return { pastStart, now, upcomingEnd };
  }

  private parseStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === 'string');
  }
}
