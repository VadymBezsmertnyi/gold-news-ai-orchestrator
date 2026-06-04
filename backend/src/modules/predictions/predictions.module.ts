import { Module, forwardRef } from '@nestjs/common';

// modules
import { MarketModule } from '../market/market.module';
import { NewsModule } from '../news/news.module';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';

// local
import { PredictionsController } from './predictions.controller';
import { PredictionsService } from './predictions.service';

@Module({
  imports: [
    NewsModule,
    forwardRef(() => MarketModule),
    forwardRef(() => OrchestratorModule),
  ],
  controllers: [PredictionsController],
  providers: [PredictionsService],
  exports: [PredictionsService],
})
export class PredictionsModule {}
