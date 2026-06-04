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

IMPORTANCE HIERARCHY (strict):
- HIGH impact news must be evaluated first.
- MEDIUM impact news second.
- LOW impact news must NOT dominate direction unless several aligned LOW signals exist, no HIGH/MEDIUM conflict, and price action would confirm.

Before output, reason through (in order):
A) Is the TARGET news HIGH, MEDIUM, or LOW impact?
B) Are there HIGH/MEDIUM events in the same session window?
C) Are there conflicting signals?
D) Is this news important enough for a directional prediction (not just noise)?
E) If not important enough → lower confidence or choose NEUTRAL.

Context:
{
  "targetNews": {
    "title": "${input.title}",
    "summary": "${input.summary || ''}",
    "category": "${input.category || ''}",
    "impactLevel": "${input.impactLevel || ''}",
    "goldImpact": "${input.goldImpact || ''}",
    "impactReason": "${input.impactReason || ''}",
    "publishedAt": "${input.publishedAt.toISOString()}"
  },
  "currentPrice": ${input.currentPrice},
  "sessionNewsByImpact": ${JSON.stringify(input.sessionNewsByImpact ?? { highImpactNews: [], mediumImpactNews: [], lowImpactNews: [] })}
}

Rules:
- direction must be BUY, SELL, or NEUTRAL.
- LOW impact alone should rarely produce high-confidence BUY/SELL.
- If goldImpact is BULLISH and impact is sufficient, direction is usually BUY.
- If goldImpact is BEARISH and impact is sufficient, direction is usually SELL.
- If impact is mixed, weak, or dominated by conflicting HIGH/MEDIUM news → NEUTRAL or low confidence.
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
