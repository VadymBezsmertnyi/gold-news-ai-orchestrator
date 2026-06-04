import { Module } from '@nestjs/common';

// common
import { AppConfigModule } from './common/config/config.module';
import { PrismaModule } from './common/prisma/prisma.module';

// modules
import { AgentsModule } from './modules/agents/agents.module';
import { LearningModule } from './modules/learning/learning.module';
import { MarketModule } from './modules/market/market.module';
import { NewsModule } from './modules/news/news.module';
import { OrchestratorModule } from './modules/orchestrator/orchestrator.module';
import { PredictionsModule } from './modules/predictions/predictions.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    NewsModule,
    MarketModule,
    PredictionsModule,
    AgentsModule,
    LearningModule,
    OrchestratorModule,
  ],
})
export class AppModule {}
