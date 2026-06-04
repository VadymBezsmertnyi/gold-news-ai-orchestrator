import { Controller, Get, Post } from '@nestjs/common';

// local
import { MarketService } from './market.service';

@Controller('market')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get('xauusd/current')
  getCurrent() {
    return this.marketService.getCurrentXauusd();
  }

  @Post('xauusd/snapshot')
  captureSnapshot() {
    return this.marketService.captureSnapshot();
  }
}
