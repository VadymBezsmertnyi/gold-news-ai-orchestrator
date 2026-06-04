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
        activePromptImprovements: input.activePromptImprovements,
      },
      null,
      0,
    );

    return this.llmRouter.askJson<LearningAgentOutput>({
      provider: LlmProviderType.CLAUDE,
      model: process.env.CLAUDE_MODEL_SMART || 'claude-sonnet-4-6',
      temperature: 0.15,
      maxTokens: 900,
      system:
        'You improve AI agent decision-making for educational XAUUSD analytics. You create reusable prompt and reasoning improvements — never temporary market facts.',
      prompt: `
A SINGLE_NEWS prediction FAILED. Analyze why the agent reasoning failed and propose a reusable prompt improvement.

Data:
${payload}

CRITICAL:
- Do NOT store temporary market situations (e.g. "RBA inflation is weak for gold", "ceasefire in X should not trigger SELL").
- Create reusable reasoning improvements valid across different market environments.
- promptImprovement must be an instruction the model can follow in future runs (confidence adjustment, signal requirements, categorization rules).
- problemType: short category (e.g. OVERCONFIDENCE, SINGLE_DRIVER, IMPACT_MISCLASS, TIMEFRAME_MISMATCH).
- rootCause: why the agent failed (process/reasoning), not a market recap.
- shouldCreateImprovement: true only if the improvement is generalizable and not already covered by activePromptImprovements.
- confidence 1-100: strength of the improvement proposal.

GOOD promptImprovement examples:
- "Require at least two independent bullish signals before creating BUY prediction."
- "Reduce confidence when prediction is based on a single LOW impact news item."
- "Differentiate major central banks from regional central banks when evaluating inflation news."

BAD (reject — set shouldCreateImprovement false):
- "RBA inflation signals have weak gold impact."
- "Lebanon ceasefire should not trigger SELL."

Return JSON:
{
  "shouldCreateImprovement": false,
  "problemType": "OVERCONFIDENCE",
  "rootCause": "short reasoning failure explanation",
  "promptImprovement": "reusable instruction for future agent prompts",
  "confidence": 0
}
`,
    });
  }
}
