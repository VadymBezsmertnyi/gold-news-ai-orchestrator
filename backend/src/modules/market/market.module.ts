import { Module, forwardRef } from '@nestjs/common';

// modules
import { PredictionsModule } from '../predictions/predictions.module';

// local
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { MetaApiLivePriceService } from './metaapi-live-price.service';

@Module({
  imports: [forwardRef(() => PredictionsModule)],
  controllers: [MarketController],
  providers: [MarketService, MetaApiLivePriceService],
  exports: [MarketService, MetaApiLivePriceService],
})
export class MarketModule {}
