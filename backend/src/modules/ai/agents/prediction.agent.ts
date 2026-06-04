// Packages
import { Injectable } from '@nestjs/common';

// Services
import { LlmRouterService } from '../providers/llm-router.service';

// Types
import { formatHistoricalReasoningImprovementsSection } from '../../learning/prompt-improvement-prompt.format';
import { LlmProviderType } from '../types/llm.types';
import {
  PredictionAgentInput,
  PredictionAgentOutput,
} from '../types/prediction-agent.types';

@Injectable()
export class PredictionAgent {
  constructor(private readonly llmRouter: LlmRouterService) {}

  async run(input: PredictionAgentInput): Promise<PredictionAgentOutput> {
    const improvementsSection = formatHistoricalReasoningImprovementsSection(
      input.promptImprovements ?? [],
    );

    return this.llmRouter.askJson<PredictionAgentOutput>({
      provider: LlmProviderType.OPENAI,
      model: process.env.OPENAI_MODEL_FAST || 'gpt-4.1-mini',
      temperature: 0.15,
      maxTokens: 700,
      system: [
        'You are an educational XAUUSD prediction agent. You create structured hypothetical predictions only. This is not financial advice.',
        improvementsSection,
      ]
        .filter(Boolean)
        .join('\n\n'),
      prompt: `
Create an educational prediction for XAUUSD based on this analyzed news.

Context:
{
  "title": "${input.title}",
  "summary": "${input.summary || ''}",
  "category": "${input.category || ''}",
  "impactLevel": "${input.impactLevel || ''}",
  "goldImpact": "${input.goldImpact || ''}",
  "impactReason": "${input.impactReason || ''}",
  "currentPrice": ${input.currentPrice},
  "publishedAt": "${input.publishedAt.toISOString()}"
}

Rules:
- direction must be BUY, SELL, or NEUTRAL.
- If goldImpact is BULLISH, direction is usually BUY.
- If goldImpact is BEARISH, direction is usually SELL.
- If impact is mixed or weak, use NEUTRAL.
- confidence must be 1-100.
- expectedMovePercent must be realistic for the timeframe.
- timeframeMinutes should be 30, 60, 120, 240, or 1440.
- Apply HISTORICAL REASONING IMPROVEMENTS from the system prompt only when relevant — they are not market facts.
- This is educational analytics only.

Return JSON:
{
  "direction": "BUY | SELL | NEUTRAL",
  "confidence": 1,
  "expectedMovePercent": 0.1,
  "timeframeMinutes": 60,
  "reason": "short explanation"
}
`,
    });
  }
}
