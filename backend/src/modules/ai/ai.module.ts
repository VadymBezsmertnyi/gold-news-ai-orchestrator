// Packages
import { Module } from '@nestjs/common';

// Services
import { LlmRouterService } from './providers/llm-router.service';

// Agents
import { NewsClassifierAgent } from './agents/news-classifier.agent';
import { SingleNewsImpactAgent } from './agents/single-news-impact.agent';

@Module({
  providers: [LlmRouterService, NewsClassifierAgent, SingleNewsImpactAgent],
  exports: [LlmRouterService, NewsClassifierAgent, SingleNewsImpactAgent],
})
export class AiModule {}
