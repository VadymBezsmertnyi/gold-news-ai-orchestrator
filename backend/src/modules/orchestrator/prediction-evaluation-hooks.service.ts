import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import {
  NewsAnalysisStatus,
  PredictionSourceType,
  type Prediction,
  type PredictionResult,
} from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { LearningAgent } from '../ai/agents/learning.agent';
import { LearningService } from '../learning/learning.service';
import { MarketService } from '../market/market.service';
import { SERVER_LOG_TYPES } from '../server-logs/server-logs.constants';
import { ServerLogsService } from '../server-logs/server-logs.service';
import { OrchestratorService } from './orchestrator.service';
import type { PredictionEvaluationHandler } from './orchestrator.tokens';

@Injectable()
export class PredictionEvaluationHooksService implements PredictionEvaluationHandler {
  private readonly logger = new Logger(PredictionEvaluationHooksService.name);
  private readonly learningMinConfidence = Number(
    process.env.LEARNING_AGENT_MIN_CONFIDENCE ?? 60,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly learningService: LearningService,
    private readonly learningAgent: LearningAgent,
    private readonly marketService: MarketService,
    private readonly serverLogsService: ServerLogsService,
    @Inject(forwardRef(() => OrchestratorService))
    private readonly orchestratorService: OrchestratorService,
  ) {}

  async onPredictionEvaluated(
    prediction: Prediction & { result: PredictionResult | null },
    result: PredictionResult,
  ): Promise<void> {
    await this.learningService.recordEvaluationForPrediction(
      prediction,
      result.isSuccess,
    );

    if (result.isSuccess) {
      await this.maybeTriggerGlobalContextAfterResult(prediction, result);
      return;
    }

    await this.runLearningAfterFailure(prediction, result);
    await this.maybeTriggerGlobalContextAfterResult(prediction, result);
  }

  private async maybeTriggerGlobalContextAfterResult(
    prediction: Prediction,
    result: PredictionResult,
  ): Promise<void> {
    const isFreshGlobal =
      prediction.sourceType === PredictionSourceType.GLOBAL_CONTEXT &&
      Date.now() - prediction.createdAt.getTime() < 2 * 60 * 1000;
    if (isFreshGlobal) return;

    const shouldTrigger =
      prediction.confidence >= 70 ||
      !result.isSuccess ||
      prediction.sourceType === PredictionSourceType.GLOBAL_CONTEXT;

    if (!shouldTrigger) return;

    void this.orchestratorService
      .runGlobalMarketContextAnalysis('IMPORTANT_PREDICTION_RESULT')
      .catch((err) =>
        this.logger.warn('Global context after prediction result failed', err),
      );
  }

  private async runLearningAfterFailure(
    prediction: Prediction,
    result: PredictionResult,
  ): Promise<void> {
    if (prediction.sourceType !== PredictionSourceType.SINGLE_NEWS) return;
    if (!prediction.newsItemId) return;

    await this.serverLogsService.info(
      SERVER_LOG_TYPES.LEARNING_STARTED,
      'Learning agent started after failed prediction',
      { predictionId: prediction.id },
    );

    try {
      const news = await this.prisma.newsItem.findUnique({
        where: { id: prediction.newsItemId },
      });
      if (!news) {
        await this.logLearningSkipped('news_not_found', prediction.id);
        return;
      }

      const currentPrice = await this.marketService.getCurrentXauusd();
      const recentNews = await this.prisma.newsItem.findMany({
        where: { analysisStatus: NewsAnalysisStatus.ANALYZED },
        orderBy: { publishedAt: 'desc' },
        take: 8,
      });
      const activeRules =
        await this.learningService.findActivePromptImprovements();
      const activePromptImprovements =
        this.learningService.toPromptImprovementSlices(activeRules);

      const output = await this.learningAgent.run({
        news,
        prediction,
        result,
        currentPrice: currentPrice.price,
        recentNews: recentNews.map((n) => ({
          id: n.id,
          title: n.title,
          publishedAt: n.publishedAt,
          category: n.category,
          impactLevel: n.impactLevel,
          goldImpact: n.goldImpact,
          analysisSummary: n.analysisSummary,
        })),
        activePromptImprovements,
      });

      if (output.confidence < this.learningMinConfidence) {
        await this.logLearningSkipped('confidence_below_threshold', prediction.id);
        return;
      }

      const upsert = await this.learningService.upsertFromFailedPrediction(
        prediction.id,
        output,
      );

      if (!upsert) {
        await this.logLearningSkipped(
          output.rootCause || 'improvement_rejected',
          prediction.id,
        );
        return;
      }

      await this.serverLogsService.info(
        SERVER_LOG_TYPES.LEARNING_RULE_CREATED,
        upsert.mergedDuplicate
          ? 'Prompt improvement merged (duplicate)'
          : 'Prompt improvement created',
        {
          predictionId: prediction.id,
          improvementId: upsert.record.id,
          problemType: upsert.record.problemType,
          confidence: upsert.record.confidence,
          mergedDuplicate: upsert.mergedDuplicate,
        },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown learning error';
      await this.serverLogsService.error(
        SERVER_LOG_TYPES.LEARNING_ERROR,
        `Learning agent failed: ${message}`,
        { predictionId: prediction.id },
      );
      this.logger.error('Learning agent failed', error);
    }
  }

  private async logLearningSkipped(
    reason: string,
    predictionId: string,
  ): Promise<void> {
    await this.serverLogsService.info(
      SERVER_LOG_TYPES.LEARNING_SKIPPED,
      'Prompt improvement not created',
      { predictionId, reason },
    );
  }
}
