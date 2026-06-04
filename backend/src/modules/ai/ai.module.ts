// Packages
import { Module } from '@nestjs/common';

// Services
import { LlmRouterService } from './providers/llm-router.service';

// Agents
import { NewsClassifierAgent } from './agents/news-classifier.agent';

@Module({
  providers: [LlmRouterService, NewsClassifierAgent],
  exports: [LlmRouterService, NewsClassifierAgent],
})
export class AiModule {}
