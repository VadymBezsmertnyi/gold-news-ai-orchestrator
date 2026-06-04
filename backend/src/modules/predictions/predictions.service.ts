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

// modules
import { MarketService } from '../market/market.service';
import { NewsService } from '../news/news.service';
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
    const checkAfter = new Date();

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
        checkAfter,
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

    let priceBefore = prediction.priceAtPrediction;
    if (priceBefore == null) {
      const snapshot = await this.marketService.captureSnapshot();
      priceBefore = snapshot.price;
      await this.prisma.prediction.update({
        where: { id: prediction.id },
        data: { priceAtPrediction: priceBefore },
      });
    }

    const resolvedPriceAfter =
      priceAfter ?? (await this.marketService.getCurrentXauusd()).price;
    const actualMovePercent =
      priceBefore === 0
        ? 0
        : ((resolvedPriceAfter - priceBefore) / priceBefore) * 100;
    const isSuccess = this.isPredictionSuccessful(
      prediction.direction,
      priceBefore,
      resolvedPriceAfter,
      actualMovePercent,
    );
    const status = isSuccess
      ? PredictionStatus.SUCCESS
      : PredictionStatus.FAILED;

    const result = await this.prisma.$transaction(async (tx) => {
      const created = await tx.predictionResult.create({
        data: {
          predictionId: prediction.id,
          priceBefore,
          priceAfter: resolvedPriceAfter,
          actualMovePercent,
          isSuccess,
          explanation: this.buildEvaluationExplanation(
            prediction.direction,
            priceBefore,
            resolvedPriceAfter,
            actualMovePercent,
            isSuccess,
          ),
          evaluatedAt: new Date(),
        },
      });
      await tx.prediction.update({
        where: { id: prediction.id },
        data: { status },
      });
      return created;
    });

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
    priceBefore: number,
    priceAfter: number,
  ): 'SUCCESS' | 'FAILED' {
    const actualMovePercent =
      priceBefore === 0 ? 0 : ((priceAfter - priceBefore) / priceBefore) * 100;
    return this.isPredictionSuccessful(
      direction,
      priceBefore,
      priceAfter,
      actualMovePercent,
    )
      ? 'SUCCESS'
      : 'FAILED';
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

  private isPredictionSuccessful(
    direction: PredictionDirection,
    priceBefore: number,
    priceAfter: number,
    actualMovePercent: number,
  ): boolean {
    if (direction === PredictionDirection.NEUTRAL)
      return Math.abs(actualMovePercent) <= 0.1;
    if (direction === PredictionDirection.BUY) return priceAfter > priceBefore;
    if (direction === PredictionDirection.SELL) return priceAfter < priceBefore;
    return false;
  }

  private buildEvaluationExplanation(
    direction: PredictionDirection,
    priceBefore: number,
    priceAfter: number,
    actualMovePercent: number,
    isSuccess: boolean,
  ): string {
    const outcome = isSuccess ? 'SUCCESS' : 'FAILED';
    return `${outcome}: ${direction} — ${priceBefore.toFixed(2)} → ${priceAfter.toFixed(2)} (${actualMovePercent.toFixed(3)}% move).`;
  }
}
