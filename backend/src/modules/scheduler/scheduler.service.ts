import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';

// constants
import { ANALYSIS_BATCH_LIMIT } from '../../constants';

// modules
import { NewsService } from '../news/news.service';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import { EventStartPriceService } from '../predictions/event-start-price.service';
import { PredictionsService } from '../predictions/predictions.service';
import { SERVER_LOG_TYPES } from '../server-logs/server-logs.constants';
import { ServerLogsService } from '../server-logs/server-logs.service';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);
  private startupRan = false;
  private isPredictionEvaluationJobRunning = false;

  constructor(
    private readonly newsService: NewsService,
    private readonly orchestratorService: OrchestratorService,
    private readonly predictionsService: PredictionsService,
    private readonly eventStartPriceService: EventStartPriceService,
    private readonly serverLogs: ServerLogsService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.startupRan) return;
    this.startupRan = true;

    await this.serverLogs.info(
      SERVER_LOG_TYPES.SCHEDULER,
      'Scheduler started — running initial background jobs',
    );

    setTimeout(() => {
      void this.handleNewsSync();
      void this.handlePendingNewsAnalysis();
      void this.handleDuePredictionEvaluation();
    }, 3000);
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleNewsSync(): Promise<void> {
    await this.serverLogs.info(
      SERVER_LOG_TYPES.NEWS_SYNC,
      'Scheduled news sync started',
    );

    try {
      const result = await this.newsService.syncNews();
      await this.serverLogs.info(
        SERVER_LOG_TYPES.NEWS_SYNC,
        'Scheduled news sync completed',
        {
          timeWindow: { ...result.timeWindow },
          fetchedRaw: result.fetchedRaw,
          afterWindow: result.afterWindow,
          afterDedup: result.afterDedup,
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          pruned: { ...result.pruned },
          source: result.source,
          impactBreakdown: { ...result.impactBreakdown },
        } satisfies Prisma.InputJsonObject,
      );
      this.logger.log(
        `News sync: window=${result.afterWindow} dedup=${result.afterDedup} raw=${result.fetchedRaw} +${result.created} ~${result.updated} skip=${result.skipped}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown sync error';
      await this.serverLogs.error(
        SERVER_LOG_TYPES.NEWS_SYNC,
        `Scheduled news sync failed: ${message}`,
      );
      this.logger.error('Scheduled news sync failed', error);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handlePendingNewsAnalysis(): Promise<void> {
    await this.serverLogs.info(
      SERVER_LOG_TYPES.NEWS_ANALYSIS,
      'Pending news analysis started',
      { limit: ANALYSIS_BATCH_LIMIT },
    );

    try {
      const result =
        await this.orchestratorService.analyzePendingNews(ANALYSIS_BATCH_LIMIT);

      await this.serverLogs.info(
        SERVER_LOG_TYPES.NEWS_ANALYSIS,
        'Pending news analysis completed',
        {
          processed: result.processed,
          analyzed: result.analyzed,
          failed: result.failed,
          predictionsCreated: result.predictionsCreated,
          predictionsSkipped: result.predictionsSkipped,
          newsIds: result.newsIds,
        },
      );

      if (result.processed > 0)
        this.logger.log(
          `News analysis: processed=${result.processed} analyzed=${result.analyzed} failed=${result.failed} predictionsCreated=${result.predictionsCreated}`,
        );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown analysis error';
      await this.serverLogs.error(
        SERVER_LOG_TYPES.NEWS_ANALYSIS,
        `Pending news analysis failed: ${message}`,
      );
      this.logger.error('Pending news analysis failed', error);
    }
  }

  @Cron('0 */30 * * * *')
  async handleScheduledGlobalContext(): Promise<void> {
    try {
      await this.orchestratorService.runGlobalMarketContextAnalysis(
        'SCHEDULED_30M',
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown global context error';
      await this.serverLogs.error(
        SERVER_LOG_TYPES.GLOBAL_CONTEXT_ERROR,
        `Scheduled global context failed: ${message}`,
      );
      this.logger.error('Scheduled global context failed', error);
    }
  }

  @Cron('*/30 * * * * *')
  async handleEventStartPriceCapture(): Promise<void> {
    try {
      const summary =
        await this.eventStartPriceService.captureEventStartPrices();
      if (summary.processed > 0) {
        this.logger.log(
          `Event start price capture: processed=${summary.processed} live=${summary.nearLiveCaptured} history=${summary.historicalCaptured} snapshot=${summary.snapshotCaptured} missing=${summary.missing}`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown capture error';
      this.logger.error(`Event start price capture failed: ${message}`, error);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleDuePredictionEvaluation(): Promise<void> {
    if (this.isPredictionEvaluationJobRunning) {
      this.logger.warn(
        'Due prediction evaluation skipped — previous run still in progress',
      );
      return;
    }

    this.isPredictionEvaluationJobRunning = true;
    try {
      await this.serverLogs.info(
        SERVER_LOG_TYPES.PREDICTION_EVALUATION,
        'Due prediction evaluation started',
      );

      const summary = await this.predictionsService.evaluateDuePredictions();

      await this.serverLogs.info(
        SERVER_LOG_TYPES.PREDICTION_EVALUATION,
        'Due prediction evaluation completed',
        { ...summary } as unknown as Prisma.InputJsonValue,
      );

      this.logger.log(
        `Prediction evaluation: dueCandidatesCount=${summary.dueCandidatesCount} evaluated=${summary.evaluated} success=${summary.success} failed=${summary.failed} skipped=${summary.skipped.length} errors=${summary.errors.length}`,
      );
      if (summary.evaluatedIds.length > 0)
        this.logger.log(
          `Evaluated prediction ids: ${summary.evaluatedIds.join(', ')}`,
        );
      for (const skip of summary.skipped)
        this.logger.warn(
          `Skipped prediction ${skip.id ?? 'batch'}: ${skip.reason}`,
        );
      for (const err of summary.errors)
        this.logger.error(`Evaluation error for ${err.id}: ${err.error}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown evaluation error';
      await this.serverLogs.error(
        SERVER_LOG_TYPES.PREDICTION_EVALUATION,
        `Due prediction evaluation failed: ${message}`,
      );
      this.logger.error('Due prediction evaluation failed', error);
    } finally {
      this.isPredictionEvaluationJobRunning = false;
    }
  }
}
