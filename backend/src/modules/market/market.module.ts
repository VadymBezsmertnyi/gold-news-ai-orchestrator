import { Module } from '@nestjs/common';

// local
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { MetaApiPriceService } from './metaapi-price.service';

@Module({
  controllers: [MarketController],
  providers: [MarketService, MetaApiPriceService],
  exports: [MarketService, MetaApiPriceService],
})
export class MarketModule {}
