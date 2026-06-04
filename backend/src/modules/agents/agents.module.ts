import { Module } from '@nestjs/common';

// local
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

@Module({
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
