import { Injectable } from '@nestjs/common';

import { formatHistoricalReasoningImprovementsSection } from '../../learning/prompt-improvement-prompt.format';
import { LlmRouterService } from '../providers/llm-router.service';
import { LlmProviderType } from '../types/llm.types';
import {
  GlobalMarketContextAgentInput,
  GlobalMarketContextAgentOutput,
} from '../types/global-market-context.types';

@Injectable()
export class GlobalMarketContextAgent {
  constructor(private readonly llmRouter: LlmRouterService) {}

  async run(
    input: GlobalMarketContextAgentInput,
  ): Promise<GlobalMarketContextAgentOutput> {
    const improvementsSection = formatHistoricalReasoningImprovementsSection(
      input.promptImprovements,
    );

    const payload = JSON.stringify(
      {
        currentPrice: input.currentPrice,
        pastNews: input.pastNews,
        upcomingNews: input.upcomingNews,
        activePredictions: input.activePredictions,
        recentResults: input.recentResults,
      },
      null,
      0,
    );

    return this.llmRouter.askJson<GlobalMarketContextAgentOutput>({
      provider: LlmProviderType.CLAUDE,
      model: process.env.CLAUDE_MODEL_SMART || 'claude-sonnet-4-6',
      temperature: 0.2,
      maxTokens: 1200,
      system: [
        'You are an educational global XAUUSD market-context analyst. You synthesize news windows, active predictions, and recent outcomes into one holistic bias. This is not financial advice.',
        improvementsSection,
      ]
        .filter(Boolean)
        .join('\n\n'),
      prompt: `
Analyze the global gold (XAUUSD) context from the data below.

Data:
${payload}

Rules:
- globalBias must be BUY, SELL, or NEUTRAL.
- confidence is 1-100.
- expectedMovePercent should be realistic for the timeframe.
- timeframeMinutes should be 30, 60, 120, 240, or 1440.
- activeDrivers: short bullet strings (max 6).
- riskNotes: short caution bullets (max 5).
- Apply HISTORICAL REASONING IMPROVEMENTS from the system prompt only when relevant — they are not market facts.
- Do not overreact to a single headline if broader context is mixed.

Return JSON:
{
  "globalBias": "BUY | SELL | NEUTRAL",
  "confidence": 65,
  "expectedMovePercent": 0.2,
  "timeframeMinutes": 120,
  "summary": "short holistic summary",
  "activeDrivers": ["driver1"],
  "riskNotes": ["risk1"]
}
`,
    });
  }
}
