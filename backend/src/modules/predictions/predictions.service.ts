import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  PredictionDirection,
  PredictionSourceType,
  PredictionStatus,
  type Prediction,
  type PredictionResult,
} from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

// common
import { PrismaService } from '../../common/prisma/prisma.service';

// modules
import { MarketService } from '../market/market.service';
import { NewsService } from '../news/news.service';
import { MISSING_EVENT_START_PRICE } from '../../constants/event-start-price.constants';
import { EVENT_START_LOG_TYPES } from '../server-logs/server-logs.constants';
import { ServerLogsService } from '../server-logs/server-logs.service';
import { EventStartPriceService } from './event-start-price.service';
import {
  buildEvaluationExplanation,
  computePredictionScore,
  mapEventStartSourceToBaseline,
  resolveEventStartAt,
  type BaselineSource,
} from './prediction-evaluation.util';
import {
  PREDICTION_EVALUATION_HANDLER,
  type PredictionEvaluationHandler,
} from '../orchestrator/orchestrator.tokens';

export interface EvaluateDueSkipped {
  id?: string;
  reason: string;
}

export interface EvaluateDueError {
  id: string;
  error: string;
}

export interface EvaluateDueSummary {
  evaluated: number;
  success: number;
  failed: number;
  dueCandidatesCount: number;
  evaluatedIds: string[];
  skipped: EvaluateDueSkipped[];
  errors: EvaluateDueError[];
}

export interface EvaluatePredictionOutcome {
  prediction: Awaited<ReturnType<PredictionsService['findById']>>;
  result: PredictionResult | null;
  alreadyEvaluated: boolean;
  reason?: string;
}

export class SkipEvaluationError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'SkipEvaluationError';
  }
}

@Injectable()
export class PredictionsService {
  private readonly logger = new Logger(PredictionsService.name);
  private readonly evaluatingPredictionIds = new Set<string>();
  private isEvaluateDueRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly newsService: NewsService,
    @Inject(forwardRef(() => MarketService))
    private readonly marketService: MarketService,
    @Inject(forwardRef(() => EventStartPriceService))
    private readonly eventStartPriceService: EventStartPriceService,
    private readonly serverLogs: ServerLogsService,
    @Optional()
    @Inject(PREDICTION_EVALUATION_HANDLER)
    private readonly evaluationHandler: PredictionEvaluationHandler | null,
  ) {}

  async findAll(limit = 50): Promise<Prediction[]> {
    return this.prisma.prediction.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { newsItem: true, result: true },
    });
  }

  async findById(id: string) {
    const prediction = await this.prisma.prediction.findUnique({
      where: { id },
      include: { newsItem: true, result: true },
    });
    if (!prediction) throw new NotFoundException(`Prediction ${id} not found`);
    return prediction;
  }

  async hasActiveSingleNewsPrediction(newsItemId: string): Promise<boolean> {
    const now = new Date();
    const existing = await this.prisma.prediction.findFirst({
      where: {
        newsItemId,
        sourceType: PredictionSourceType.SINGLE_NEWS,
        status: PredictionStatus.PENDING,
        result: { is: null },
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
    });
    return !!existing;
  }

  async createMockPrediction(): Promise<Prediction> {
    const newsItems = await this.newsService.findAll(1);
    let newsItemId = newsItems[0]?.id;
    if (!newsItemId) {
      const mockNews = await this.newsService.createMockNews();
      newsItemId = mockNews.id;
    }

    if (await this.hasActiveSingleNewsPrediction(newsItemId))
      return this.findActiveSingleNewsPrediction(newsItemId);

    const price = await this.marketService.getCurrentXauusd();
    const news = await this.newsService.findById(newsItemId);
    const eventStartAt = news.eventStartAt ?? news.publishedAt;
    const eventEndAt = new Date(eventStartAt.getTime() + 60 * 60 * 1000);

    return this.prisma.prediction.create({
      data: {
        newsItemId,
        direction: PredictionDirection.BUY,
        confidence: 72,
        expectedMovePercent: 0.35,
        timeframeMinutes: 60,
        reason:
          'Mock prediction for learning pipeline — replace with agent orchestration later.',
        status: PredictionStatus.PENDING,
        priceAtPrediction: price.price,
        eventStartAt,
        eventEndAt,
        checkAfter: eventEndAt,
        validFrom: eventStartAt,
        validUntil: eventEndAt,
        expiresAt: eventEndAt,
        sourceType: PredictionSourceType.SINGLE_NEWS,
      },
      include: { newsItem: true },
    });
  }

  async evaluateDuePredictions(): Promise<EvaluateDueSummary> {
    if (this.isEvaluateDueRunning) {
      return {
        dueCandidatesCount: 0,
        evaluated: 0,
        success: 0,
        failed: 0,
        skipped: [{ reason: 'evaluation_already_running' }],
        errors: [],
        evaluatedIds: [],
      };
    }

    this.isEvaluateDueRunning = true;
    try {
      return await this.runEvaluateDuePredictions();
    } finally {
      this.isEvaluateDueRunning = false;
    }
  }

  private async runEvaluateDuePredictions(): Promise<EvaluateDueSummary> {
    const now = new Date();
    const due = await this.prisma.prediction.findMany({
      where: this.duePredictionWhere(now),
      orderBy: { checkAfter: 'asc' },
      include: { newsItem: true },
    });

    const summary: EvaluateDueSummary = {
      evaluated: 0,
      success: 0,
      failed: 0,
      dueCandidatesCount: due.length,
      evaluatedIds: [],
      skipped: [],
      errors: [],
    };

    for (const prediction of due) {
      try {
        const outcome = await this.evaluatePrediction(prediction.id);

        if (outcome.alreadyEvaluated) {
          summary.skipped.push({
            id: prediction.id,
            reason: outcome.reason ?? 'already_evaluated',
          });
          continue;
        }

        if (!outcome.result) {
          summary.skipped.push({
            id: prediction.id,
            reason: 'no_result_created',
          });
          continue;
        }

        summary.evaluated++;
        summary.evaluatedIds.push(prediction.id);
        if (outcome.result.isSuccess) summary.success++;
        else summary.failed++;
      } catch (error) {
        if (error instanceof SkipEvaluationError) {
          summary.skipped.push({
            id: prediction.id,
            reason: error.reason,
          });
          continue;
        }
        const message =
          error instanceof Error ? error.message : 'Unknown evaluation error';
        summary.errors.push({ id: prediction.id, error: message });
        this.logger.error(
          `Due prediction evaluation failed for ${prediction.id}: ${message}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    this.logger.log(
      `Due prediction evaluation: dueCandidatesCount=${summary.dueCandidatesCount} evaluated=${summary.evaluated} success=${summary.success} failed=${summary.failed} skipped=${summary.skipped.length} errors=${summary.errors.length}`,
    );

    return summary;
  }

  async evaluateActivePredictionsByPrice(
    priceAfter: number,
  ): Promise<EvaluateDueSummary> {
    const now = new Date();
    const active = await this.prisma.prediction.findMany({
      where: this.activePredictionWhere(now),
      orderBy: { checkAfter: 'asc' },
    });

    const dueNow = active.filter((p) => now >= p.checkAfter);
    return this.evaluatePredictionBatch(dueNow, (id) =>
      this.evaluatePrediction(id, priceAfter),
    );
  }

  async evaluatePrediction(
    predictionId: string,
    priceAfter?: number,
  ): Promise<EvaluatePredictionOutcome> {
    if (this.evaluatingPredictionIds.has(predictionId)) {
      const prediction = await this.findById(predictionId);
      return {
        prediction,
        result: prediction.result,
        alreadyEvaluated: true,
        reason: 'already_evaluating',
      };
    }

    this.evaluatingPredictionIds.add(predictionId);
    try {
      return await this.runEvaluatePrediction(predictionId, priceAfter);
    } finally {
      this.evaluatingPredictionIds.delete(predictionId);
    }
  }

  private async runEvaluatePrediction(
    predictionId: string,
    priceAfter?: number,
  ): Promise<EvaluatePredictionOutcome> {
    const prediction = await this.findById(predictionId);
    if (prediction.result)
      return {
        prediction,
        result: prediction.result,
        alreadyEvaluated: true,
        reason: 'already_evaluated',
      };

    const baselineOutcome = await this.resolveEvaluationBaseline(prediction);
    if (!baselineOutcome.ok) {
      await this.serverLogs.warn(
        EVENT_START_LOG_TYPES.MISSING,
        'Evaluation skipped — missing event start price',
        {
          predictionId: prediction.id,
          eventStartAt: resolveEventStartAt(prediction).toISOString(),
          reason: baselineOutcome.reason,
        },
      );
      throw new SkipEvaluationError(baselineOutcome.reason);
    }
    const { baseline, baselineSource, priceAtEventStart } = baselineOutcome;

    const resolvedPriceAfter =
      priceAfter ?? (await this.marketService.getCurrentXauusd()).price;

    const score = computePredictionScore(
      prediction.direction,
      baseline,
      resolvedPriceAfter,
      prediction.expectedMovePercent,
    );
    const status = score.isSuccess
      ? PredictionStatus.SUCCESS
      : PredictionStatus.FAILED;

    let racedToExisting = false;
    const result = await this.prisma.$transaction(async (tx) => {
      const existingResult = await tx.predictionResult.findUnique({
        where: { predictionId: prediction.id },
      });
      if (existingResult) {
        racedToExisting = true;
        await tx.prediction.update({
          where: { id: prediction.id },
          data: {
            status: existingResult.isSuccess
              ? PredictionStatus.SUCCESS
              : PredictionStatus.FAILED,
            priceAtEventStart,
            priceAtEventEnd: existingResult.priceAfter,
          },
        });
        return existingResult;
      }

      try {
        const created = await tx.predictionResult.create({
          data: {
            predictionId: prediction.id,
            priceBefore: baseline,
            priceAfter: resolvedPriceAfter,
            actualMovePercent: score.actualMovePercent,
            isSuccess: score.isSuccess,
            directionCorrect: score.directionCorrect,
            moveAccuracyPercent: score.moveAccuracyPercent,
            finalScore: score.finalScore,
            baselineSource,
            explanation: buildEvaluationExplanation(
              prediction.direction,
              baseline,
              resolvedPriceAfter,
              score,
              baselineSource,
              score.isSuccess,
            ),
            evaluatedAt: new Date(),
          },
        });
        await tx.prediction.update({
          where: { id: prediction.id },
          data: {
            status,
            priceAtEventStart,
            priceAtEventEnd: resolvedPriceAfter,
          },
        });
        return created;
      } catch (error) {
        if (
          error instanceof PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const raced = await tx.predictionResult.findUnique({
            where: { predictionId: prediction.id },
          });
          if (raced) {
            racedToExisting = true;
            await tx.prediction.update({
              where: { id: prediction.id },
              data: {
                status: raced.isSuccess
                  ? PredictionStatus.SUCCESS
                  : PredictionStatus.FAILED,
                priceAtEventStart,
                priceAtEventEnd: raced.priceAfter,
              },
            });
            return raced;
          }
        }
        throw error;
      }
    });

    if (racedToExisting) {
      const updated = await this.findById(predictionId);
      return {
        prediction: updated,
        result,
        alreadyEvaluated: true,
        reason: 'already_evaluated',
      };
    }

    this.logger.log(
      `Prediction evaluated: ${JSON.stringify({
        predictionId: prediction.id,
        sourceType: prediction.sourceType,
        eventStartAt:
          prediction.eventStartAt ?? resolveEventStartAt(prediction),
        eventEndAt: prediction.eventEndAt ?? prediction.checkAfter,
        baselineSource,
        priceAtPrediction: prediction.priceAtPrediction,
        priceAtEventStart,
        priceAfter: resolvedPriceAfter,
        actualMovePercent: score.actualMovePercent,
        expectedMovePercent: prediction.expectedMovePercent,
        moveAccuracyPercent: score.moveAccuracyPercent,
        finalScore: score.finalScore,
        directionCorrect: score.directionCorrect,
        status,
      })}`,
    );

    const updated = await this.findById(predictionId);
    if (this.evaluationHandler)
      void this.evaluationHandler
        .onPredictionEvaluated(updated, result)
        .catch((err) => {
          console.warn('Post-evaluation orchestrator hook failed', err);
        });

    return { prediction: updated, result, alreadyEvaluated: false };
  }

  async evaluateMock(predictionId: string): Promise<EvaluatePredictionOutcome> {
    return this.evaluatePrediction(predictionId);
  }

  async countByStatus(status: PredictionStatus): Promise<number> {
    return this.prisma.prediction.count({ where: { status } });
  }

  async countActivePredictions(): Promise<number> {
    const now = new Date();
    return this.prisma.prediction.count({
      where: this.activePredictionWhere(now),
    });
  }

  previewEvaluationOutcome(
    direction: PredictionDirection,
    baseline: number,
    priceAfter: number,
    expectedMovePercent: number | null,
  ): 'SUCCESS' | 'FAILED' {
    return computePredictionScore(
      direction,
      baseline,
      priceAfter,
      expectedMovePercent,
    ).isSuccess
      ? 'SUCCESS'
      : 'FAILED';
  }

  computeDashboardMetrics(
    prediction: Awaited<
      ReturnType<PredictionsService['findRecentForDashboard']>
    >[number],
    livePrice: number | null,
  ) {
    const needsEventBaseline =
      prediction.sourceType === PredictionSourceType.SINGLE_NEWS &&
      (prediction.eventStartAt != null ||
        prediction.newsItem?.eventStartAt != null);

    const missingEventStartPrice =
      needsEventBaseline &&
      prediction.priceAtEventStart == null &&
      prediction.result?.priceBefore == null;

    if (missingEventStartPrice) {
      return {
        baseline: null,
        priceAfter: prediction.result?.priceAfter ?? null,
        signedDeltaPercent: null,
        actualMovePercent: null,
        moveAccuracyPercent: null,
        finalScore: null,
        directionCorrect: null,
        isPreview: false,
        previewOutcome: null,
        baselineSource: null,
        missingEventStartPrice: true,
        baselinePriceTime: null,
        baselineTimeDiffSeconds: null,
      };
    }

    const baseline =
      prediction.priceAtEventStart ??
      prediction.result?.priceBefore ??
      (needsEventBaseline ? null : prediction.priceAtPrediction);
    const priceAfter =
      prediction.result?.priceAfter ??
      prediction.priceAtEventEnd ??
      (missingEventStartPrice ? null : livePrice);
    if (baseline == null || priceAfter == null) return null;

    const score = computePredictionScore(
      prediction.direction,
      baseline,
      priceAfter,
      prediction.expectedMovePercent,
    );
    const isPending =
      prediction.status === PredictionStatus.PENDING && !prediction.result;

    return {
      baseline,
      priceAfter,
      signedDeltaPercent: score.signedMovePercent,
      actualMovePercent: score.actualMovePercent,
      moveAccuracyPercent: score.moveAccuracyPercent,
      finalScore: score.finalScore,
      directionCorrect: score.directionCorrect,
      isPreview: isPending && !needsEventBaseline,
      previewOutcome:
        isPending && !needsEventBaseline
          ? score.isSuccess
            ? 'SUCCESS'
            : 'FAILED'
          : null,
      baselineSource: prediction.result?.baselineSource ?? null,
      missingEventStartPrice: false,
      baselinePriceTime: resolveEventStartAt(prediction),
      baselineTimeDiffSeconds: null,
    };
  }

  private async resolveEvaluationBaseline(
    prediction: Awaited<ReturnType<PredictionsService['findById']>>,
  ): Promise<
    | {
        ok: true;
        baseline: number;
        baselineSource: BaselineSource;
        priceAtEventStart: number;
      }
    | { ok: false; reason: string }
  > {
    const needsEventBaseline =
      prediction.sourceType === PredictionSourceType.SINGLE_NEWS &&
      (prediction.eventStartAt != null ||
        prediction.newsItem?.eventStartAt != null);

    if (!needsEventBaseline) {
      if (prediction.priceAtPrediction == null)
        return { ok: false, reason: MISSING_EVENT_START_PRICE };
      return {
        ok: true,
        baseline: prediction.priceAtPrediction,
        baselineSource: 'priceAtPrediction',
        priceAtEventStart: prediction.priceAtPrediction,
      };
    }

    const resolved =
      await this.eventStartPriceService.resolvePredictionEventStartPrice(
        prediction,
      );

    if (resolved.price == null)
      return {
        ok: false,
        reason: resolved.reason ?? MISSING_EVENT_START_PRICE,
      };

    if (prediction.priceAtEventStart == null) {
      await this.prisma.prediction.update({
        where: { id: prediction.id },
        data: {
          priceAtEventStart: resolved.price,
          invalidationReason: null,
        },
      });
    }

    return {
      ok: true,
      baseline: resolved.price,
      baselineSource: mapEventStartSourceToBaseline(resolved.source),
      priceAtEventStart: resolved.price,
    };
  }

  async findRecentForDashboard(limit = 15) {
    return this.prisma.prediction.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { newsItem: true, result: true },
    });
  }

  private async findActiveSingleNewsPrediction(
    newsItemId: string,
  ): Promise<Prediction> {
    const now = new Date();
    const prediction = await this.prisma.prediction.findFirst({
      where: {
        newsItemId,
        sourceType: PredictionSourceType.SINGLE_NEWS,
        status: PredictionStatus.PENDING,
        result: { is: null },
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      include: { newsItem: true },
    });
    if (!prediction)
      throw new NotFoundException(
        `No active SINGLE_NEWS prediction for news ${newsItemId}`,
      );
    return prediction;
  }

  /** Overdue PENDING predictions ready for scheduled evaluation (no expiry window). */
  private duePredictionWhere(now: Date): {
    status: PredictionStatus;
    result: { is: null };
    checkAfter: { lte: Date };
  } {
    return {
      status: PredictionStatus.PENDING,
      result: { is: null },
      checkAfter: { lte: now },
    };
  }

  private activePredictionWhere(now: Date): {
    status: PredictionStatus;
    result: { is: null };
    AND: Array<
      | { OR: Array<{ validFrom: null } | { validFrom: { lte: Date } }> }
      | { OR: Array<{ expiresAt: null } | { expiresAt: { gte: Date } }> }
    >;
  } {
    return {
      status: PredictionStatus.PENDING,
      result: { is: null },
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
      ],
    };
  }

  private async evaluatePredictionBatch(
    predictions: Array<{ id: string }>,
    evaluate: (id: string) => Promise<EvaluatePredictionOutcome>,
  ): Promise<EvaluateDueSummary> {
    const summary: EvaluateDueSummary = {
      evaluated: 0,
      success: 0,
      failed: 0,
      dueCandidatesCount: predictions.length,
      evaluatedIds: [],
      skipped: [],
      errors: [],
    };

    for (const prediction of predictions) {
      try {
        const outcome = await evaluate(prediction.id);
        if (outcome.alreadyEvaluated) {
          summary.skipped.push({
            id: prediction.id,
            reason: outcome.reason ?? 'already_evaluated',
          });
          continue;
        }
        if (!outcome.result) {
          summary.skipped.push({
            id: prediction.id,
            reason: 'no_result_created',
          });
          continue;
        }

        summary.evaluated++;
        summary.evaluatedIds.push(prediction.id);
        if (outcome.result.isSuccess) summary.success++;
        else summary.failed++;
      } catch (error) {
        if (error instanceof SkipEvaluationError) {
          summary.skipped.push({
            id: prediction.id,
            reason: error.reason,
          });
          continue;
        }
        const message =
          error instanceof Error ? error.message : 'Unknown evaluation error';
        summary.errors.push({ id: prediction.id, error: message });
      }
    }

    return summary;
  }
}
