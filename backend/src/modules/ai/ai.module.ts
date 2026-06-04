// Packages
import { Module } from '@nestjs/common';

// Services
import { LlmRouterService } from './providers/llm-router.service';

@Module({
  providers: [LlmRouterService],
  exports: [LlmRouterService],
})
export class AiModule {}
