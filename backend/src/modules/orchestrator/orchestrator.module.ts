import { Module } from '@nestjs/common';

// modules
import { AgentsModule } from '../agents/agents.module';
import { LearningModule } from '../learning/learning.module';
import { NewsModule } from '../news/news.module';
import { PredictionsModule } from '../predictions/predictions.module';

// local
import { OrchestratorController } from './orchestrator.controller';
import { OrchestratorService } from './orchestrator.service';

@Module({
  imports: [NewsModule, PredictionsModule, LearningModule, AgentsModule],
  controllers: [OrchestratorController],
  providers: [OrchestratorService],
})
export class OrchestratorModule {}
