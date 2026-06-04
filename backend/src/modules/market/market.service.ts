import { forwardRef, Inject, Injectable } from '@nestjs/common';
import type { MarketPriceSnapshot, Prisma } from '@prisma/client';

// types
import type { BaselineSource } from '../predictions/prediction-evaluation.util';

// common
import { PrismaService } from '../../common/prisma/prisma.service';
import { XAUUSD_SYMBOL } from '../../constants';

// modules
import { PredictionsService } from '../predictions/predictions.service';
import type { EvaluateDueSummary } from '../predictions/predictions.service';

// local
import {
  MetaApiLivePriceService,
  type MarketPriceView,
} from './metaapi-live-price.service';

const SNAPSHOT_WINDOW_MS = 10 * 60 * 1000;

export interface NearestSnapshotResult {
  price: number;
  source: BaselineSource | 'fallback_current';
}

export interface EventBaselineSnapshotResult {
  price: number;
  source: 'snapshot_before' | 'snapshot_after';
  capturedAt: Date;
}

export interface PriceUpdateResult {
  snapshot: MarketPriceSnapshot;
  evaluation: EvaluateDueSummary;
}

@Injectable()
export class MarketService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => MetaApiLivePriceService))
    private readonly metaApiLive: MetaApiLivePriceService,
    @Inject(forwardRef(() => PredictionsService))
    private readonly predictionsService: PredictionsService,
  ) {}

  async getCurrentXauusd(): Promise<MarketPriceView> {
    return this.metaApiLive.resolveMarketPrice();
  }

  async captureSnapshot(): Promise<MarketPriceSnapshot> {
    const current = await this.getCurrentXauusd();
    return this.prisma.marketPriceSnapshot.create({
      data: {
        symbol: XAUUSD_SYMBOL,
        price: current.price,
        source: current.source,
        capturedAt: current.updatedAt,
        rawPayload: {
          bid: current.bid,
          ask: current.ask,
          connected: current.connected,
        },
      },
    });
  }

  async getLatestSnapshot(): Promise<MarketPriceSnapshot | null> {
    return this.prisma.marketPriceSnapshot.findFirst({
      where: { symbol: XAUUSD_SYMBOL },
      orderBy: { capturedAt: 'desc' },
    });
  }

  /**
   * Nearest XAUUSD snapshot within ±10 minutes of targetTime.
   * Falls back to live price (if target is in the past) then priceAtPrediction.
   */
  async findNearestSnapshot(
    symbol: string,
    targetTime: Date,
    fallbackPriceAtPrediction?: number | null,
  ): Promise<NearestSnapshotResult> {
    const windowStart = new Date(targetTime.getTime() - SNAPSHOT_WINDOW_MS);
    const windowEnd = new Date(targetTime.getTime() + SNAPSHOT_WINDOW_MS);

    const before = await this.prisma.marketPriceSnapshot.findFirst({
      where: {
        symbol,
        capturedAt: { gte: windowStart, lte: targetTime },
      },
      orderBy: { capturedAt: 'desc' },
    });
    if (before) return { price: before.price, source: 'snapshot_before' };

    const after = await this.prisma.marketPriceSnapshot.findFirst({
      where: {
        symbol,
        capturedAt: { gt: targetTime, lte: windowEnd },
      },
      orderBy: { capturedAt: 'asc' },
    });
    if (after) return { price: after.price, source: 'snapshot_after' };

    const now = Date.now();
    if (targetTime.getTime() <= now) {
      const live = await this.getCurrentXauusd();
      return { price: live.price, source: 'fallback_current' };
    }

    if (fallbackPriceAtPrediction != null)
      return {
        price: fallbackPriceAtPrediction,
        source: 'priceAtPrediction',
      };

    const live = await this.getCurrentXauusd();
    return { price: live.price, source: 'fallback_current' };
  }

  /** Snapshot-only lookup for event-start baseline (no live-price fallback). */
  async findNearestSnapshotForEventBaseline(
    symbol: string,
    targetTime: Date,
  ): Promise<EventBaselineSnapshotResult | null> {
    const windowStart = new Date(targetTime.getTime() - SNAPSHOT_WINDOW_MS);
    const windowEnd = new Date(targetTime.getTime() + SNAPSHOT_WINDOW_MS);

    const before = await this.prisma.marketPriceSnapshot.findFirst({
      where: {
        symbol,
        capturedAt: { gte: windowStart, lte: targetTime },
      },
      orderBy: { capturedAt: 'desc' },
    });
    if (before) {
      return {
        price: before.price,
        source: 'snapshot_before',
        capturedAt: before.capturedAt,
      };
    }

    const after = await this.prisma.marketPriceSnapshot.findFirst({
      where: {
        symbol,
        capturedAt: { gt: targetTime, lte: windowEnd },
      },
      orderBy: { capturedAt: 'asc' },
    });
    if (after) {
      return {
        price: after.price,
        source: 'snapshot_after',
        capturedAt: after.capturedAt,
      };
    }

    return null;
  }

  async handlePriceUpdate(
    price: number,
    source = 'manual',
  ): Promise<PriceUpdateResult> {
    const capturedAt = new Date();
    const snapshot = await this.prisma.marketPriceSnapshot.create({
      data: {
        symbol: XAUUSD_SYMBOL,
        price,
        source,
        capturedAt,
        rawPayload: { trigger: 'handlePriceUpdate' } as Prisma.InputJsonValue,
      },
    });
    const evaluation =
      await this.predictionsService.evaluateActivePredictionsByPrice(price);
    return { snapshot, evaluation };
  }
}
