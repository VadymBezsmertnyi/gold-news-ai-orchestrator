import { Module, forwardRef } from '@nestjs/common';

// modules
import { PredictionsModule } from '../predictions/predictions.module';

// local
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { MetaApiPriceService } from './metaapi-price.service';

@Module({
  imports: [forwardRef(() => PredictionsModule)],
  controllers: [MarketController],
  providers: [MarketService, MetaApiPriceService],
  exports: [MarketService, MetaApiPriceService],
})
export class MarketModule {}
