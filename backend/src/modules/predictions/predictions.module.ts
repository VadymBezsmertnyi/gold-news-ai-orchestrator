import { Module, forwardRef } from '@nestjs/common';

// modules
import { MarketModule } from '../market/market.module';
import { NewsModule } from '../news/news.module';
import { ServerLogsModule } from '../server-logs/server-logs.module';

// local
import { EventStartPriceService } from './event-start-price.service';
import { PredictionsController } from './predictions.controller';
import { PredictionsService } from './predictions.service';

@Module({
  imports: [NewsModule, ServerLogsModule, forwardRef(() => MarketModule)],
  controllers: [PredictionsController],
  providers: [PredictionsService, EventStartPriceService],
  exports: [PredictionsService, EventStartPriceService],
})
export class PredictionsModule {}
