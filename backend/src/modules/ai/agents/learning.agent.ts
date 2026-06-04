import { Injectable } from '@nestjs/common';

import { LlmRouterService } from '../providers/llm-router.service';
import { LlmProviderType } from '../types/llm.types';
import {
  LearningAgentInput,
  LearningAgentOutput,
} from '../types/learning-agent.types';

@Injectable()
export class LearningAgent {
  constructor(private readonly llmRouter: LlmRouterService) {}

  async run(input: LearningAgentInput): Promise<LearningAgentOutput> {
    const payload = JSON.stringify(
      {
        news: {
          id: input.news.id,
          title: input.news.title,
          category: input.news.category,
          impactLevel: input.news.impactLevel,
          goldImpact: input.news.goldImpact,
          analysisSummary: input.news.analysisSummary,
        },
        prediction: {
          id: input.prediction.id,
          direction: input.prediction.direction,
          confidence: input.prediction.confidence,
          reason: input.prediction.reason,
          sourceType: input.prediction.sourceType,
        },
        result: {
          isSuccess: input.result.isSuccess,
          actualMovePercent: input.result.actualMovePercent,
          priceBefore: input.result.priceBefore,
          priceAfter: input.result.priceAfter,
        },
        currentPrice: input.currentPrice,
        recentNews: input.recentNews,
        activeLearningRules: input.activeLearningRules,
      },
      null,
      0,
    );

    return this.llmRouter.askJson<LearningAgentOutput>({
      provider: LlmProviderType.CLAUDE,
      model: process.env.CLAUDE_MODEL_SMART || 'claude-sonnet-4-6',
      temperature: 0.15,
      maxTokens: 700,
      system:
        'You are an educational post-mortem analyst for failed XAUUSD predictions. You propose concise learning rules only when a clear repeatable pattern exists. Avoid overfitting.',
      prompt: `
A prediction FAILED. Decide whether a new learning rule should be created.

Data:
${payload}

Rules:
- shouldCreateRule: true only if there is a clear, generalizable pattern.
- Do not create a rule for every failure.
- title and description must be short and educational.
- confidence 1-100 reflects how strong the pattern is.
- If similar activeLearningRules already cover this, set shouldCreateRule false.

Return JSON:
{
  "shouldCreateRule": false,
  "title": "short rule title",
  "description": "one or two sentences",
  "confidence": 0,
  "reason": "why or why not"
}
`,
    });
  }
}
