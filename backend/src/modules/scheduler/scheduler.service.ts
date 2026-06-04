import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

// modules
import { NewsService } from '../news/news.service';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import { PredictionsService } from '../predictions/predictions.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly newsService: NewsService,
    private readonly orchestratorService: OrchestratorService,
    private readonly predictionsService: PredictionsService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleNewsSync(): Promise<void> {
    try {
      const result = await this.newsService.syncNews();
      this.logger.log(
        `Scheduled news sync: synced=${result.synced} skipped=${result.skipped} source=${result.source}`,
      );
    } catch (error) {
      this.logger.error('Scheduled news sync failed', error);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handlePendingNewsAnalysis(): Promise<void> {
    try {
      const result =
        await this.orchestratorService.analyzePendingNewsPlaceholder();
      if (result.count > 0)
        this.logger.log(
          `Pending news analysis placeholder: count=${result.count} ids=${result.ids.join(', ')}`,
        );
    } catch (error) {
      this.logger.error('Pending news analysis hook failed', error);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleDuePredictionEvaluation(): Promise<void> {
    try {
      const summary = await this.predictionsService.evaluateDuePredictions();
      if (summary.evaluated > 0)
        this.logger.log(
          `Due prediction evaluation: evaluated=${summary.evaluated} success=${summary.success} failed=${summary.failed}`,
        );
    } catch (error) {
      this.logger.error('Due prediction evaluation failed', error);
    }
  }
}
