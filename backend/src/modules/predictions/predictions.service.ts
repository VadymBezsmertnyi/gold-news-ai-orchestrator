import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PredictionDirection,
  PredictionStatus,
  type Prediction,
  type PredictionResult,
} from '@prisma/client';

// common
import { PrismaService } from '../../common/prisma/prisma.service';

// modules
import { MarketService } from '../market/market.service';
import { NewsService } from '../news/news.service';

export interface EvaluateDueSummary {
  evaluated: number;
  success: number;
  failed: number;
}

export interface EvaluatePredictionOutcome {
  prediction: Awaited<ReturnType<PredictionsService['findById']>>;
  result: PredictionResult | null;
  alreadyEvaluated: boolean;
}

@Injectable()
export class PredictionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly newsService: NewsService,
    private readonly marketService: MarketService,
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
    if (!prediction)
      throw new NotFoundException(`Prediction ${id} not found`);
    return prediction;
  }

  async createMockPrediction(): Promise<Prediction> {
    const newsItems = await this.newsService.findAll(1);
    let newsItemId = newsItems[0]?.id;
    if (!newsItemId) {
      const mockNews = await this.newsService.createMockNews();
      newsItemId = mockNews.id;
    }

    const price = await this.marketService.getCurrentXauusd();
    const timeframeMinutes = 60;
    const checkAfter = new Date();

    return this.prisma.prediction.create({
      data: {
        newsItemId,
        direction: PredictionDirection.BUY,
        confidence: 72,
        expectedMovePercent: 0.35,
        timeframeMinutes,
        reason:
          'Mock prediction for learning pipeline — replace with agent orchestration later.',
        status: PredictionStatus.PENDING,
        priceAtPrediction: price.price,
        checkAfter,
      },
      include: { newsItem: true },
    });
  }

  /**
   * Local/manual evaluation for due predictions (no Redis or job queue).
   * A future BullMQ worker can call evaluatePrediction() per id on a schedule.
   */
  async evaluateDuePredictions(): Promise<EvaluateDueSummary> {
    const due = await this.prisma.prediction.findMany({
      where: {
        status: PredictionStatus.PENDING,
        checkAfter: { lte: new Date() },
        result: { is: null },
      },
      orderBy: { checkAfter: 'asc' },
    });

    const summary: EvaluateDueSummary = {
      evaluated: 0,
      success: 0,
      failed: 0,
    };

    for (const prediction of due) {
      const outcome = await this.evaluatePrediction(prediction.id);
      if (outcome.alreadyEvaluated || !outcome.result) continue;

      summary.evaluated++;
      if (outcome.result.isSuccess) summary.success++;
      else summary.failed++;
    }

    return summary;
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
    return { prediction: updated, result, alreadyEvaluated: false };
  }

  async evaluateMock(predictionId: string): Promise<EvaluatePredictionOutcome> {
    return this.evaluatePrediction(predictionId);
  }

  async countByStatus(status: PredictionStatus): Promise<number> {
    return this.prisma.prediction.count({ where: { status } });
  }

  async findRecentForDashboard(limit = 10) {
    return this.prisma.prediction.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { newsItem: true, result: true },
    });
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
