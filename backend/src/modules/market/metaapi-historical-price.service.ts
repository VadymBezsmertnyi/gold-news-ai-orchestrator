import { Injectable, Logger } from '@nestjs/common';
import { METAAPI_HISTORY_MAX_CANDLE_DIFF_SECONDS } from '../../constants/event-start-price.constants';
import { ServerLogsService } from '../server-logs/server-logs.service';
import { EVENT_START_LOG_TYPES } from '../server-logs/server-logs.constants';
import { MetaApiLivePriceService } from './metaapi-live-price.service';
import type {
  MetaApiCandleLike,
  MetaApiHistoricalPriceResult,
} from './metaapi-historical-price.types';

const ONE_MINUTE_MS = 60 * 1000;
const HISTORY_LOOKBACK_MINUTES = 45;
const HISTORY_CANDLE_LIMIT = 120;

@Injectable()
export class MetaApiHistoricalPriceService {
  private readonly logger = new Logger(MetaApiHistoricalPriceService.name);

  constructor(
    private readonly metaApiLive: MetaApiLivePriceService,
    private readonly serverLogs: ServerLogsService,
  ) {}

  async getHistoricalPriceAt(
    symbol: string,
    targetTime: Date,
    predictionId?: string,
  ): Promise<MetaApiHistoricalPriceResult | null> {
    const requestedTime = targetTime.toISOString();

    await this.serverLogs.info(
      EVENT_START_LOG_TYPES.HISTORY_REQUEST,
      'MetaAPI historical price request',
      { predictionId, symbol, requestedTime },
    );

    try {
      const account = await this.metaApiLive.getMetatraderAccountForHistory();
      if (!account) {
        await this.logHistoryFailed(
          predictionId,
          requestedTime,
          'metaapi_account_unavailable',
        );
        return null;
      }

      const startTime = new Date(
        targetTime.getTime() - HISTORY_LOOKBACK_MINUTES * ONE_MINUTE_MS,
      );
      const rawCandles = (await account.getHistoricalCandles(
        symbol,
        '1m',
        startTime,
        HISTORY_CANDLE_LIMIT,
      )) as MetaApiCandleLike[];

      if (!rawCandles?.length) {
        await this.logHistoryFailed(
          predictionId,
          requestedTime,
          'no_candles_returned',
        );
        return null;
      }

      const picked = this.pickCandleNearTarget(rawCandles, targetTime);
      if (!picked) {
        await this.logHistoryFailed(
          predictionId,
          requestedTime,
          'no_candle_within_window',
        );
        return null;
      }

      const { candle, timeDiffSeconds } = picked;
      const candleTime = this.parseCandleTime(candle);
      const bid = candle.close;
      const ask = candle.close;
      const price = (candle.open + candle.close) / 2;

      const result: MetaApiHistoricalPriceResult = {
        price,
        bid,
        ask,
        time: candleTime,
        source: 'metaapi_history',
        timeDiffSeconds,
      };

      await this.serverLogs.info(
        EVENT_START_LOG_TYPES.HISTORY_FOUND,
        'MetaAPI historical price found',
        {
          predictionId,
          requestedTime,
          candleTime: candleTime.toISOString(),
          price,
          timeDiffSeconds,
        },
      );

      return result;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown MetaAPI history error';
      await this.logHistoryFailed(predictionId, requestedTime, message);
      this.logger.warn(`MetaAPI historical price failed: ${message}`, error);
      return null;
    }
  }

  private pickCandleNearTarget(
    candles: MetaApiCandleLike[],
    targetTime: Date,
  ): { candle: MetaApiCandleLike; timeDiffSeconds: number } | null {
    const targetMs = targetTime.getTime();
    let containing: MetaApiCandleLike | null = null;
    let nearest: MetaApiCandleLike | null = null;
    let nearestDiffMs = Infinity;

    for (const candle of candles) {
      const openMs = this.parseCandleTime(candle).getTime();
      const closeMs = openMs + ONE_MINUTE_MS;
      if (targetMs >= openMs && targetMs < closeMs) {
        containing = candle;
        break;
      }
      const diff = Math.abs(targetMs - openMs);
      if (diff < nearestDiffMs) {
        nearestDiffMs = diff;
        nearest = candle;
      }
    }

    const chosen = containing ?? nearest;
    if (!chosen) return null;

    const openMs = this.parseCandleTime(chosen).getTime();
    const timeDiffSeconds = Math.round((targetMs - openMs) / 1000);
    if (Math.abs(timeDiffSeconds) > METAAPI_HISTORY_MAX_CANDLE_DIFF_SECONDS)
      return null;

    return { candle: chosen, timeDiffSeconds };
  }

  private parseCandleTime(candle: MetaApiCandleLike): Date {
    const t = candle.time;
    return t instanceof Date ? t : new Date(t);
  }

  private async logHistoryFailed(
    predictionId: string | undefined,
    requestedTime: string,
    reason: string,
  ): Promise<void> {
    await this.serverLogs.warn(
      EVENT_START_LOG_TYPES.HISTORY_FAILED,
      `MetaAPI historical price failed: ${reason}`,
      { predictionId, requestedTime, reason },
    );
  }
}
