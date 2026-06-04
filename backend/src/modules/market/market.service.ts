import { forwardRef, Inject, Injectable } from '@nestjs/common';
import type { MarketPriceSnapshot, Prisma } from '@prisma/client';

// common
import { PrismaService } from '../../common/prisma/prisma.service';
import { XAUUSD_SYMBOL } from '../../constants';

// modules
import { PredictionsService } from '../predictions/predictions.service';
import type { EvaluateDueSummary } from '../predictions/predictions.service';

// local
import { MetaApiPriceService, type CurrentGoldPrice } from './metaapi-price.service';

export interface PriceUpdateResult {
  snapshot: MarketPriceSnapshot;
  evaluation: EvaluateDueSummary;
}

@Injectable()
export class MarketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metaApiPrice: MetaApiPriceService,
    @Inject(forwardRef(() => PredictionsService))
    private readonly predictionsService: PredictionsService,
  ) {}

  async getCurrentXauusd(): Promise<CurrentGoldPrice> {
    return this.metaApiPrice.getCurrentGoldPrice();
  }

  async captureSnapshot(): Promise<MarketPriceSnapshot> {
    const current = await this.getCurrentXauusd();
    return this.prisma.marketPriceSnapshot.create({
      data: {
        symbol: XAUUSD_SYMBOL,
        price: current.price,
        source: current.source,
        capturedAt: current.capturedAt,
        rawPayload: (current.rawPayload ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
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
   * Persists a price tick and evaluates active predictions that are due (checkAfter <= now).
   */
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
        rawPayload: { trigger: 'handlePriceUpdate' },
      },
    });
    const evaluation =
      await this.predictionsService.evaluateActivePredictionsByPrice(price);
    return { snapshot, evaluation };
  }
}
