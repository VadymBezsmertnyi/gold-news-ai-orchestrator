// Packages
import { Module } from '@nestjs/common';

// Services
import { LlmRouterService } from './providers/llm-router.service';

// Agents
import { GlobalMarketContextAgent } from './agents/global-market-context.agent';
import { LearningAgent } from './agents/learning.agent';
import { NewsClassifierAgent } from './agents/news-classifier.agent';
import { PredictionAgent } from './agents/prediction.agent';
import { SingleNewsImpactAgent } from './agents/single-news-impact.agent';

@Module({
  providers: [
    LlmRouterService,
    NewsClassifierAgent,
    SingleNewsImpactAgent,
    PredictionAgent,
    GlobalMarketContextAgent,
    LearningAgent,
  ],
  exports: [
    LlmRouterService,
    NewsClassifierAgent,
    SingleNewsImpactAgent,
    PredictionAgent,
    GlobalMarketContextAgent,
    LearningAgent,
  ],
})
export class AiModule {}
