import {
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

// common
import { PrismaService } from '../../common/prisma/prisma.service';
import { XAUUSD_SYMBOL } from '../../constants';

// modules
import { MarketService } from '../market/market.service';
import { NewsService } from '../news/news.service';
import {
  buildEvaluationExplanation,
  computePredictionScore,
  resolveEventStartAt,
  type BaselineSource,
} from './prediction-evaluation.util';
import {
  PREDICTION_EVALUATION_HANDLER,
  type PredictionEvaluationHandler,
} from '../orchestrator/orchestrator.tokens';

export interface EvaluateDueSkipped {
  id: string;
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
}

@Injectable()
export class PredictionsService {
  private readonly logger = new Logger(PredictionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly newsService: NewsService,
    private readonly marketService: MarketService,
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
    const now = new Date();
    const due = await this.prisma.prediction.findMany({
      where: this.duePredictionWhere(now),
      orderBy: { checkAfter: 'asc' },
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
            reason: 'already_evaluated',
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
    const prediction = await this.findById(predictionId);
    if (prediction.result)
      return {
        prediction,
        result: prediction.result,
        alreadyEvaluated: true,
      };

    const { baseline, baselineSource, priceAtEventStart } =
      await this.resolveEvaluationBaseline(prediction);

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

    const result = await this.prisma.$transaction(async (tx) => {
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
    });

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
    const baseline =
      prediction.priceAtEventStart ??
      prediction.result?.priceBefore ??
      prediction.priceAtPrediction;
    const priceAfter =
      prediction.result?.priceAfter ?? prediction.priceAtEventEnd ?? livePrice;
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
      isPreview: isPending,
      previewOutcome: isPending
        ? score.isSuccess
          ? 'SUCCESS'
          : 'FAILED'
        : null,
      baselineSource: prediction.result?.baselineSource ?? null,
    };
  }

  private async resolveEvaluationBaseline(
    prediction: Awaited<ReturnType<PredictionsService['findById']>>,
  ): Promise<{
    baseline: number;
    baselineSource: BaselineSource;
    priceAtEventStart: number;
  }> {
    if (prediction.priceAtEventStart != null)
      return {
        baseline: prediction.priceAtEventStart,
        baselineSource: 'priceAtEventStart',
        priceAtEventStart: prediction.priceAtEventStart,
      };

    const eventStartAt = resolveEventStartAt(prediction);
    const snap = await this.marketService.findNearestSnapshot(
      XAUUSD_SYMBOL,
      eventStartAt,
      prediction.priceAtPrediction,
    );

    if (
      snap.source === 'snapshot_before' ||
      snap.source === 'snapshot_after' ||
      snap.source === 'fallback_current'
    )
      return {
        baseline: snap.price,
        baselineSource: snap.source,
        priceAtEventStart: snap.price,
      };

    if (prediction.priceAtPrediction != null)
      return {
        baseline: prediction.priceAtPrediction,
        baselineSource: 'priceAtPrediction',
        priceAtEventStart: prediction.priceAtPrediction,
      };

    return {
      baseline: snap.price,
      baselineSource: snap.source,
      priceAtEventStart: snap.price,
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
            reason: 'already_evaluated',
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
        const message =
          error instanceof Error ? error.message : 'Unknown evaluation error';
        summary.errors.push({ id: prediction.id, error: message });
      }
    }

    return summary;
  }
}
