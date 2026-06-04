import { Module } from '@nestjs/common';

// modules
import { NewsModule } from '../news/news.module';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';
import { PredictionsModule } from '../predictions/predictions.module';
import { ServerLogsModule } from '../server-logs/server-logs.module';

// local
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [
    ServerLogsModule,
    NewsModule,
    OrchestratorModule,
    PredictionsModule,
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}
