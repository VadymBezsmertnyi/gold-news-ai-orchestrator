import { Injectable, Logger } from '@nestjs/common';
import {
  PredictionSourceType,
  PredictionStatus,
  type Prediction,
} from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import {
  EVENT_START_CAPTURE_BATCH_LIMIT,
  EVENT_START_CAPTURE_WINDOW_SECONDS,
  MISSING_EVENT_START_PRICE,
} from '../../constants/event-start-price.constants';
import { XAUUSD_SYMBOL } from '../../constants';
import { MetaApiHistoricalPriceService } from '../market/metaapi-historical-price.service';
import { MetaApiLivePriceService } from '../market/metaapi-live-price.service';
import { MarketService } from '../market/market.service';
import { EVENT_START_LOG_TYPES } from '../server-logs/server-logs.constants';
import { ServerLogsService } from '../server-logs/server-logs.service';
import { resolveEventStartAt } from './prediction-evaluation.util';
import type { EventStartPriceResolution } from './event-start-price.types';

export interface CaptureEventStartPricesSummary {
  nearLiveCaptured: number;
  historicalCaptured: number;
  snapshotCaptured: number;
  missing: number;
  processed: number;
}

@Injectable()
export class EventStartPriceService {
  private readonly logger = new Logger(EventStartPriceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaApiLive: MetaApiLivePriceService,
    private readonly metaApiHistorical: MetaApiHistoricalPriceService,
    private readonly marketService: MarketService,
    private readonly serverLogs: ServerLogsService,
  ) {}

  async resolvePredictionEventStartPrice(
    prediction: Prediction & {
      newsItem?: {
        eventStartAt: Date | null;
        publishedAt: Date;
      } | null;
    },
  ): Promise<EventStartPriceResolution> {
    if (prediction.priceAtEventStart != null) {
      const eventStartAt = resolveEventStartAt(prediction);
      return {
        price: prediction.priceAtEventStart,
        source: 'priceAtEventStart',
        time: eventStartAt,
        timeDiffSeconds: 0,
      };
    }

    if (prediction.sourceType === PredictionSourceType.GLOBAL_CONTEXT) {
      if (prediction.priceAtPrediction != null) {
        return {
          price: prediction.priceAtPrediction,
          source: 'priceAtPrediction',
          time: prediction.eventStartAt ?? prediction.createdAt,
        };
      }
      return {
        price: null,
        source: 'missing',
        reason: MISSING_EVENT_START_PRICE,
      };
    }

    const eventStartAt = resolveEventStartAt(prediction);
    const nowMs = Date.now();
    const eventMs = eventStartAt.getTime();
    const diffSeconds = Math.round(Math.abs(nowMs - eventMs) / 1000);

    if (diffSeconds <= EVENT_START_CAPTURE_WINDOW_SECONDS) {
      const live = this.metaApiLive.getLatestPrice();
      if (live) {
        return {
          price: live.price,
          source: 'live_at_event_start',
          time: live.time,
          timeDiffSeconds: diffSeconds,
        };
      }
    }

    if (eventMs < nowMs - EVENT_START_CAPTURE_WINDOW_SECONDS * 1000) {
      const historical = await this.metaApiHistorical.getHistoricalPriceAt(
        XAUUSD_SYMBOL,
        eventStartAt,
        prediction.id,
      );
      if (historical) {
        return {
          price: historical.price,
          source: 'metaapi_history',
          time: historical.time,
          timeDiffSeconds: historical.timeDiffSeconds,
        };
      }
    }

    const snapshot =
      await this.marketService.findNearestSnapshotForEventBaseline(
        XAUUSD_SYMBOL,
        eventStartAt,
      );
    if (snapshot) {
      return {
        price: snapshot.price,
        source: snapshot.source,
        time: eventStartAt,
        timeDiffSeconds: Math.round(
          (eventStartAt.getTime() - snapshot.capturedAt.getTime()) / 1000,
        ),
      };
    }

    return {
      price: null,
      source: 'missing',
      reason: MISSING_EVENT_START_PRICE,
      time: eventStartAt,
    };
  }

  async captureEventStartPrices(): Promise<CaptureEventStartPricesSummary> {
    const summary: CaptureEventStartPricesSummary = {
      nearLiveCaptured: 0,
      historicalCaptured: 0,
      snapshotCaptured: 0,
      missing: 0,
      processed: 0,
    };

    const now = new Date();
    const windowMs = EVENT_START_CAPTURE_WINDOW_SECONDS * 1000;
    const nearFrom = new Date(now.getTime() - windowMs);
    const nearTo = new Date(now.getTime() + windowMs);
    const pastCutoff = new Date(now.getTime() - windowMs);

    const candidates = await this.prisma.prediction.findMany({
      where: {
        status: PredictionStatus.PENDING,
        sourceType: PredictionSourceType.SINGLE_NEWS,
        eventStartAt: { not: null },
        priceAtEventStart: null,
        OR: [
          { invalidationReason: null },
          { invalidationReason: { not: MISSING_EVENT_START_PRICE } },
        ],
        AND: [
          {
            OR: [
              { eventStartAt: { gte: nearFrom, lte: nearTo } },
              { eventStartAt: { lt: pastCutoff } },
            ],
          },
        ],
      },
      orderBy: { eventStartAt: 'asc' },
      take: EVENT_START_CAPTURE_BATCH_LIMIT,
      include: { newsItem: true },
    });

    for (const prediction of candidates) {
      summary.processed++;
      const resolution =
        await this.resolvePredictionEventStartPrice(prediction);

      if (resolution.price == null) {
        summary.missing++;
        await this.prisma.prediction.update({
          where: { id: prediction.id },
          data: { invalidationReason: MISSING_EVENT_START_PRICE },
        });
        await this.serverLogs.warn(
          EVENT_START_LOG_TYPES.MISSING,
          'Event start price missing',
          {
            predictionId: prediction.id,
            eventStartAt: resolveEventStartAt(prediction).toISOString(),
            reason: resolution.reason,
          },
        );
        continue;
      }

      await this.prisma.prediction.update({
        where: { id: prediction.id },
        data: {
          priceAtEventStart: resolution.price,
          invalidationReason: null,
        },
      });

      if (resolution.source === 'live_at_event_start')
        summary.nearLiveCaptured++;
      else if (resolution.source === 'metaapi_history')
        summary.historicalCaptured++;
      else if (
        resolution.source === 'snapshot_before' ||
        resolution.source === 'snapshot_after'
      )
        summary.snapshotCaptured++;

      await this.serverLogs.info(
        EVENT_START_LOG_TYPES.CAPTURED,
        'Event start price captured',
        {
          predictionId: prediction.id,
          eventStartAt: resolveEventStartAt(prediction).toISOString(),
          source: resolution.source,
          price: resolution.price,
          timeDiffSeconds: resolution.timeDiffSeconds,
        },
      );
    }

    this.logger.log(
      `captureEventStartPrices: processed=${summary.processed} live=${summary.nearLiveCaptured} history=${summary.historicalCaptured} snapshot=${summary.snapshotCaptured} missing=${summary.missing}`,
    );

    return summary;
  }
}
