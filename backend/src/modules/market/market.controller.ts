import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';

// local
import { MetaApiHistoricalPriceService } from './metaapi-historical-price.service';
import { MarketService } from './market.service';

@Controller('market')
export class MarketController {
  constructor(
    private readonly marketService: MarketService,
    private readonly metaApiHistorical: MetaApiHistoricalPriceService,
  ) {}

  @Get('xauusd/current')
  getCurrent() {
    return this.marketService.getCurrentXauusd();
  }

  @Post('xauusd/snapshot')
  captureSnapshot() {
    return this.marketService.captureSnapshot();
  }

  /** Local debug: historical baseline lookup for a UTC instant. */
  @Get('xauusd/history-test')
  async historyTest(@Query('time') time?: string) {
    if (!time?.trim())
      throw new BadRequestException(
        'Query param "time" required (ISO UTC), e.g. 2026-06-04T09:30:00.000Z',
      );

    const targetTime = new Date(time);
    if (Number.isNaN(targetTime.getTime()))
      throw new BadRequestException(`Invalid time: ${time}`);

    return this.metaApiHistorical.getHistoricalPriceDebug(targetTime);
  }
}
