import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { MetatraderAccount } from 'metaapi.cloud-sdk';

import { METAAPI_HISTORY_RETRY_COOLDOWN_MS } from '../../constants/event-start-price.constants';
import { METAAPI_LOG_TYPES } from '../server-logs/server-logs.constants';
import { ServerLogsService } from '../server-logs/server-logs.service';
import { EVENT_START_LOG_TYPES } from '../server-logs/server-logs.constants';
import { MetaApiLivePriceService } from './metaapi-live-price.service';
import type {
  MetaApiCandleLike,
  MetaApiHistoricalPriceDebugResult,
  MetaApiHistoricalPriceResult,
  MetaApiHistoryDebugPayload,
  MetaApiHistoryFetchAttemptMeta,
} from './metaapi-historical-price.types';

const TIMEFRAME_MS: Record<string, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
};

interface HistoryFetchPlan {
  label: string;
  timeframe: '1m' | '5m';
  /** Minutes after targetTime used as MetaAPI startTime (loads backwards from this point). */
  endOffsetMinutes: number;
  limit: number;
  maxDiffSeconds: number;
}

const FETCH_PLANS: HistoryFetchPlan[] = [
  {
    label: '1m_window_15m',
    timeframe: '1m',
    endOffsetMinutes: 15,
    limit: 30,
    maxDiffSeconds: 15 * 60,
  },
  {
    label: '1m_window_60m',
    timeframe: '1m',
    endOffsetMinutes: 60,
    limit: 90,
    maxDiffSeconds: 60 * 60,
  },
  {
    label: '5m_window_60m',
    timeframe: '5m',
    endOffsetMinutes: 60,
    limit: 24,
    maxDiffSeconds: 60 * 60,
  },
];

@Injectable()
export class MetaApiHistoricalPriceService {
  private readonly logger = new Logger(MetaApiHistoricalPriceService.name);
  private readonly lastAttemptAt = new Map<string, number>();
  private readonly lastFailureLogAt = new Map<string, number>();

  constructor(
    private readonly metaApiLive: MetaApiLivePriceService,
    private readonly serverLogs: ServerLogsService,
  ) {}

  resolveHistorySymbol(requestedSymbol?: string): string {
    return (
      requestedSymbol?.trim() || this.metaApiLive.getStreamSymbol() || 'XAUUSD'
    );
  }

  canAttemptHistory(key: string, force = false): boolean {
    if (force) return true;
    const last = this.lastAttemptAt.get(key);
    if (!last) return true;
    return Date.now() - last >= METAAPI_HISTORY_RETRY_COOLDOWN_MS;
  }

  async getHistoricalPriceAt(
    symbol: string,
    targetTime: Date,
    predictionId?: string,
    options?: { force?: boolean },
  ): Promise<MetaApiHistoricalPriceResult | null> {
    const result = await this.fetchHistoricalPrice({
      symbol: this.resolveHistorySymbol(symbol),
      targetTime,
      predictionId,
      force: options?.force,
    });
    return result.price;
  }

  async getHistoricalPriceDebug(
    targetTime: Date,
    symbol?: string,
  ): Promise<MetaApiHistoricalPriceDebugResult> {
    const resolvedSymbol = this.resolveHistorySymbol(symbol);
    const { price, debug } = await this.fetchHistoricalPrice({
      symbol: resolvedSymbol,
      targetTime,
      force: true,
      collectDebug: true,
    });

    const lastAttempt = debug.attempts[debug.attempts.length - 1];
    return {
      requestedTime: targetTime.toISOString(),
      symbol: resolvedSymbol,
      price: price?.price ?? null,
      source: price?.source ?? null,
      candleTime: price?.time.toISOString() ?? null,
      timeDiffSeconds: price?.timeDiffSeconds ?? null,
      rawCount: lastAttempt?.rawCount ?? 0,
      debug,
    };
  }

  private async fetchHistoricalPrice(params: {
    symbol: string;
    targetTime: Date;
    predictionId?: string;
    force?: boolean;
    collectDebug?: boolean;
  }): Promise<{
    price: MetaApiHistoricalPriceResult | null;
    debug: MetaApiHistoryDebugPayload;
  }> {
    const { symbol, targetTime, predictionId, force, collectDebug } = params;
    const requestedTime = targetTime.toISOString();
    const throttleKey = predictionId ?? requestedTime;
    const debug: MetaApiHistoryDebugPayload = {
      requestedTime,
      symbol,
      method: 'MetatraderAccount.getHistoricalCandles',
      attempts: [],
    };

    if (!this.canAttemptHistory(throttleKey, force)) {
      debug.throttled = true;
      return { price: null, debug };
    }

    this.lastAttemptAt.set(throttleKey, Date.now());

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
          debug,
        );
        return { price: null, debug };
      }

      debug.accountId = account.id;

      for (const plan of FETCH_PLANS) {
        const attempt = await this.runFetchPlan(
          account,
          symbol,
          targetTime,
          plan,
          collectDebug || !!predictionId,
        );
        debug.attempts.push(attempt);

        await this.serverLogs.info(
          METAAPI_LOG_TYPES.HISTORY_DEBUG,
          `MetaAPI history attempt ${plan.label}`,
          {
            predictionId,
            symbol,
            requestedTime,
            ...attempt,
          },
        );

        if (
          attempt.picked &&
          attempt.nearestTimeDiffSeconds != null &&
          attempt.price != null &&
          attempt.candleTimeIso
        ) {
          const candleTime = new Date(attempt.candleTimeIso);
          const timeDiffSeconds = attempt.nearestTimeDiffSeconds;
          const price = attempt.price;
          const timeframeMs =
            TIMEFRAME_MS[plan.timeframe] ?? TIMEFRAME_MS['1m'];

          const result: MetaApiHistoricalPriceResult = {
            price,
            bid: price,
            ask: price,
            time: candleTime,
            source: 'metaapi_history',
            timeDiffSeconds,
          };

          this.lastFailureLogAt.delete(throttleKey);

          await this.serverLogs.info(
            METAAPI_LOG_TYPES.HISTORY_FOUND,
            'MetaAPI historical candle matched target',
            {
              predictionId,
              symbol,
              requestedTime,
              plan: plan.label,
              timeframe: plan.timeframe,
              metaApiStartTime: attempt.metaApiStartTime,
              candleTime: candleTime.toISOString(),
              timeDiffSeconds,
              rawCount: attempt.rawCount,
              timeframeMs,
            },
          );

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

          return { price: result, debug };
        }

        if (
          attempt.rawCount > 0 &&
          attempt.nearestTimeDiffSeconds != null &&
          Math.abs(attempt.nearestTimeDiffSeconds) > plan.maxDiffSeconds
        ) {
          await this.serverLogs.warn(
            METAAPI_LOG_TYPES.HISTORY_TIME_MISMATCH,
            'MetaAPI nearest candle outside allowed window',
            {
              predictionId,
              symbol,
              requestedTime,
              plan: plan.label,
              nearestTimeDiffSeconds: attempt.nearestTimeDiffSeconds,
              maxDiffSeconds: plan.maxDiffSeconds,
            },
          );
        }
      }

      await this.logHistoryFailed(
        predictionId,
        requestedTime,
        'no_candle_within_window',
        debug,
        throttleKey,
      );
      return { price: null, debug };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown MetaAPI history error';
      await this.logHistoryFailed(
        predictionId,
        requestedTime,
        message,
        debug,
        throttleKey,
      );
      this.logger.warn(`MetaAPI historical price failed: ${message}`, error);
      return { price: null, debug };
    }
  }

  private async runFetchPlan(
    account: MetatraderAccount,
    symbol: string,
    targetTime: Date,
    plan: HistoryFetchPlan,
    logDetails: boolean,
  ): Promise<MetaApiHistoryFetchAttemptMeta> {
    const now = Date.now();
    const metaApiStartTime = new Date(
      Math.min(
        targetTime.getTime() + plan.endOffsetMinutes * 60 * 1000,
        now + 60 * 1000,
      ),
    );

    const rawCandles = (await account.getHistoricalCandles(
      symbol,
      plan.timeframe,
      metaApiStartTime,
      plan.limit,
    )) as MetaApiCandleLike[];

    const sorted = sortCandlesAsc(rawCandles);
    const pick = pickCandleNearTarget(
      sorted,
      targetTime,
      TIMEFRAME_MS[plan.timeframe] ?? TIMEFRAME_MS['1m'],
      plan.maxDiffSeconds,
    );

    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const attempt: MetaApiHistoryFetchAttemptMeta = {
      label: plan.label,
      timeframe: plan.timeframe,
      metaApiStartTime: metaApiStartTime.toISOString(),
      limit: plan.limit,
      maxDiffSeconds: plan.maxDiffSeconds,
      rawCount: sorted.length,
      firstCandleTime: first ? parseCandleTime(first).toISOString() : null,
      lastCandleTime: last ? parseCandleTime(last).toISOString() : null,
      nearestCandleTime: pick
        ? parseCandleTime(pick.candle).toISOString()
        : null,
      nearestTimeDiffSeconds: pick?.timeDiffSeconds ?? null,
      picked: !!pick,
      failReason: pick ? undefined : sorted.length ? 'outside_window' : 'empty',
    };

    if (logDetails && sorted.length === 0) {
      await this.serverLogs.warn(
        METAAPI_LOG_TYPES.HISTORY_EMPTY,
        `MetaAPI returned no ${plan.timeframe} candles`,
        {
          symbol,
          requestedTime: targetTime.toISOString(),
          metaApiStartTime: attempt.metaApiStartTime,
          plan: plan.label,
        },
      );
    }

    if (pick) {
      const candleTime = parseCandleTime(pick.candle);
      attempt.price = (pick.candle.open + pick.candle.close) / 2;
      attempt.candleTimeIso = candleTime.toISOString();
    }

    return attempt;
  }

  private async logHistoryFailed(
    predictionId: string | undefined,
    requestedTime: string,
    reason: string,
    debug: MetaApiHistoryDebugPayload,
    throttleKey?: string,
  ): Promise<void> {
    const key = throttleKey ?? predictionId ?? requestedTime;
    const lastLog = this.lastFailureLogAt.get(key) ?? 0;
    const shouldLog = Date.now() - lastLog >= METAAPI_HISTORY_RETRY_COOLDOWN_MS;

    if (shouldLog) {
      this.lastFailureLogAt.set(key, Date.now());
      await this.serverLogs.warn(
        EVENT_START_LOG_TYPES.HISTORY_FAILED,
        `MetaAPI historical price failed: ${reason}`,
        {
          predictionId,
          requestedTime,
          reason,
          debug: debug as unknown as Prisma.InputJsonValue,
        },
      );
    }
  }
}

function sortCandlesAsc(candles: MetaApiCandleLike[]): MetaApiCandleLike[] {
  return [...candles].sort(
    (a, b) => parseCandleTime(a).getTime() - parseCandleTime(b).getTime(),
  );
}

function pickCandleNearTarget(
  candles: MetaApiCandleLike[],
  targetTime: Date,
  timeframeMs: number,
  maxDiffSeconds: number,
): { candle: MetaApiCandleLike; timeDiffSeconds: number } | null {
  if (!candles.length) return null;

  const targetMs = targetTime.getTime();
  let containing: MetaApiCandleLike | null = null;
  let nearest: MetaApiCandleLike | null = null;
  let nearestDiffMs = Infinity;

  for (const candle of candles) {
    const openMs = parseCandleTime(candle).getTime();
    const closeMs = openMs + timeframeMs;
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

  const openMs = parseCandleTime(chosen).getTime();
  const timeDiffSeconds = Math.round((targetMs - openMs) / 1000);
  if (Math.abs(timeDiffSeconds) > maxDiffSeconds) return null;

  return { candle: chosen, timeDiffSeconds };
}

/** Normalize MetaAPI candle time (UTC). Handles Date, ISO string, epoch s/ms, brokerTime. */
export function parseCandleTime(candle: MetaApiCandleLike): Date {
  const raw = candle.time;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d;
  }

  if (typeof raw === 'string' && raw.trim()) {
    const asNum = Number(raw);
    if (Number.isFinite(asNum)) {
      const ms = asNum < 1e12 ? asNum * 1000 : asNum;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d;
    }
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }

  if (candle.brokerTime?.trim()) {
    const normalized = candle.brokerTime.trim().replace(' ', 'T');
    const withZ = normalized.endsWith('Z') ? normalized : `${normalized}Z`;
    const d = new Date(withZ);
    if (!Number.isNaN(d.getTime())) return d;
  }

  return new Date(NaN);
}
