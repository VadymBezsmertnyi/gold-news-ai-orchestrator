import { Module } from '@nestjs/common';

// local
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';

@Module({
  controllers: [LearningController],
  providers: [LearningService],
  exports: [LearningService],
})
export class LearningModule {}
