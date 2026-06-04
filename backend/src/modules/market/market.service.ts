import { Injectable } from '@nestjs/common';
import type { MarketPriceSnapshot, Prisma } from '@prisma/client';

// common
import { PrismaService } from '../../common/prisma/prisma.service';
import { XAUUSD_SYMBOL } from '../../constants';

// local
import { MetaApiPriceService, type CurrentGoldPrice } from './metaapi-price.service';

@Injectable()
export class MarketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metaApiPrice: MetaApiPriceService,
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
}
