import { Module } from '@nestjs/common';

// modules
import { NewsModule } from '../news/news.module';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';
import { PredictionsModule } from '../predictions/predictions.module';

// local
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [NewsModule, OrchestratorModule, PredictionsModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
