import { Module, forwardRef } from '@nestjs/common';

// modules
import { AgentsModule } from '../agents/agents.module';
import { LearningModule } from '../learning/learning.module';
import { NewsModule } from '../news/news.module';
import { PredictionsModule } from '../predictions/predictions.module';
import { AiModule } from '../ai/ai.module';
import { MarketModule } from '../market/market.module';

// local
import { OrchestratorController } from './orchestrator.controller';
import { OrchestratorService } from './orchestrator.service';

@Module({
  imports: [
    AiModule,
    MarketModule,
    NewsModule,
    forwardRef(() => PredictionsModule),
    LearningModule,
    AgentsModule,
  ],
  controllers: [OrchestratorController],
  providers: [OrchestratorService],
  exports: [OrchestratorService],
})
export class OrchestratorModule {}
