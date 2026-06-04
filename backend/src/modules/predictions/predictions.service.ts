import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PredictionDirection,
  PredictionStatus,
  type Prediction,
} from '@prisma/client';

// common
import { PrismaService } from '../../common/prisma/prisma.service';

// modules
import { MarketService } from '../market/market.service';
import { NewsService } from '../news/news.service';

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
    const checkAfter = new Date(Date.now() + timeframeMinutes * 60 * 1000);

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

  async evaluateMock(predictionId: string) {
    const prediction = await this.findById(predictionId);
    if (prediction.result)
      return { prediction, result: prediction.result, alreadyEvaluated: true };

    const priceBefore =
      prediction.priceAtPrediction ??
      (await this.marketService.getCurrentXauusd()).price;
    const current = await this.marketService.getCurrentXauusd();
    const priceAfter = current.price;
    const actualMovePercent =
      priceBefore === 0
        ? 0
        : ((priceAfter - priceBefore) / priceBefore) * 100;

    const expected = prediction.expectedMovePercent ?? 0;
    const direction = prediction.direction;
    let isSuccess = false;

    if (direction === PredictionDirection.NEUTRAL)
      isSuccess = Math.abs(actualMovePercent) < 0.1;
    else if (direction === PredictionDirection.BUY)
      isSuccess = actualMovePercent >= expected * 0.5;
    else if (direction === PredictionDirection.SELL)
      isSuccess = actualMovePercent <= -Math.abs(expected) * 0.5;

    const status = isSuccess
      ? PredictionStatus.SUCCESS
      : PredictionStatus.FAILED;

    const result = await this.prisma.$transaction(async (tx) => {
      const created = await tx.predictionResult.create({
        data: {
          predictionId: prediction.id,
          priceBefore,
          priceAfter,
          actualMovePercent,
          isSuccess,
          explanation: `Mock evaluation: move ${actualMovePercent.toFixed(3)}% vs expected ${expected}% (${direction}).`,
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
}
