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
        news: input.news,
        prediction: input.prediction,
        result: input.result,
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
      maxTokens: 700,
      system: `You are a Prompt Improvement Quality Engine for educational XAUUSD analytics.
Output reusable prompt-design fixes only. Never store market conclusions or event-specific rules.
Keep rootCause under 220 chars and promptImprovement under 280 chars.`,
      prompt: `
A SINGLE_NEWS prediction FAILED. Propose ONE reusable prompt improvement OR decline.

Data:
${payload}

ALLOWED problemType: ${allowedTypes}

LENGTH LIMITS (hard):
- rootCause max 220 chars
- promptImprovement max 280 chars
- no paragraphs, no headline names, no countries/events as rules

Set shouldCreateImprovement=false with declineReason when:
- MARKET_NOISE — random move, not fixable by prompt
- INSUFFICIENT_EVIDENCE — not enough to generalize
- DATA_GAP — missing input data caused failure
- PRICE_HISTORY_GAP — price/history issue, not reasoning
- DUPLICATE_EXISTING — same as activePromptImprovements
- TOO_MARKET_SPECIFIC — cannot generalize without event names

FORBIDDEN in promptImprovement (use TOO_MARKET_SPECIFIC):
- Lebanon/Hezbollah/Fed/CPI/EIA/jobless claims specific rules
- "X news means BUY/SELL"
- Any one-time market opinion

GOOD promptImprovement examples:
- "Rank simultaneous signals by impact before direction."
- "Reduce confidence when same-session signals conflict."
- "Do not use signals absent from input data."

Return JSON:
{
  "shouldCreateImprovement": false,
  "declineReason": "MARKET_NOISE",
  "problemType": "REASONING_GAP",
  "rootCause": "",
  "promptImprovement": "",
  "confidence": 0
}
`,
    });
  }
}
