import { Injectable } from '@nestjs/common';

import { PROMPT_IMPROVEMENT_PROBLEM_TYPES } from '../../learning/prompt-improvement.constants';
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

    const allowedTypes = PROMPT_IMPROVEMENT_PROBLEM_TYPES.join(', ');

    return this.llmRouter.askJson<LearningAgentOutput>({
      provider: LlmProviderType.CLAUDE,
      model: process.env.CLAUDE_MODEL_SMART || 'claude-sonnet-4-6',
      temperature: 0.15,
      maxTokens: 900,
      system: `You are a Prompt Improvement Engine for educational XAUUSD analytics agents.
You analyze reasoning failures and produce reusable prompt-design fixes.
You NEVER store market conclusions, geopolitical takes, or event-specific opinions.`,
      prompt: `
A SINGLE_NEWS prediction FAILED. Diagnose the reasoning/process failure and propose ONE reusable prompt improvement.

Data:
${payload}

ALLOWED problemType (use exactly one):
${allowedTypes}

OUTPUT MEANING:
- problemType: category of reasoning failure (from allowed list only)
- rootCause: why the agent's reasoning process failed (not a market recap)
- promptImprovement: instruction to add to future agent prompts (how to think, not what the market is)
- shouldCreateImprovement: false if not generalizable or duplicates activePromptImprovements
- confidence: 1-100 strength of this improvement proposal

GOOD example (SIGNAL_WEIGHTING_GAP):
rootCause: "Agent counted signals equally instead of weighting by impact."
promptImprovement: "Rank all available signals by expected market importance before determining directional bias."

GOOD example (CONFIDENCE_GAP):
rootCause: "Confidence was too high despite conflicting signals."
promptImprovement: "Reduce confidence when opposing signals are present and cannot be clearly ranked."

FORBIDDEN (set shouldCreateImprovement: false):
- "Lebanon ceasefire usually does not move gold."
- "UK construction data is bullish."
- "RBA inflation comments are weak for gold."
- "Three bullish signals override geopolitical signals."
- "SELL should not be used for ceasefire news."
- Any headline-specific or country-specific market rule

Return JSON:
{
  "shouldCreateImprovement": false,
  "problemType": "REASONING_GAP",
  "rootCause": "",
  "promptImprovement": "",
  "confidence": 0
}
`,
    });
  }
}
