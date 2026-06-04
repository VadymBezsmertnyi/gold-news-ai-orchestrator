// Packages
import { Injectable } from '@nestjs/common';

// Services
import { LlmRouterService } from '../providers/llm-router.service';

// Types
import { LlmProviderType } from '../types/llm.types';
import {
  SingleNewsImpactInput,
  SingleNewsImpactOutput,
} from '../types/single-news-impact.types';

@Injectable()
export class SingleNewsImpactAgent {
  constructor(private readonly llmRouter: LlmRouterService) {}

  async run(input: SingleNewsImpactInput): Promise<SingleNewsImpactOutput> {
    return this.llmRouter.askJson<SingleNewsImpactOutput>({
      provider: LlmProviderType.CLAUDE,
      model: process.env.CLAUDE_MODEL_SMART || 'claude-sonnet-4-6',
      temperature: 0.15,
      maxTokens: 700,
      system:
        'You are an educational macro analyst for gold / XAUUSD. Analyze possible market impact. Do not provide trading advice.',
      prompt: `
Analyze the possible impact of this news on gold / XAUUSD.

News:
{
  "title": "${input.title}",
  "summary": "${input.summary || ''}",
  "category": "${input.category || ''}",
  "impactLevel": "${input.impactLevel || ''}",
  "source": "${input.source}",
  "publishedAt": "${input.publishedAt.toISOString()}"
}

Rules:
- BULLISH means supportive for gold price.
- BEARISH means negative for gold price.
- NEUTRAL means unclear or mixed.
- Keep explanation short.
- This is educational analytics only.

Return JSON:
{
  "goldImpact": "BULLISH | BEARISH | NEUTRAL",
  "expectedVolatility": "LOW | MEDIUM | HIGH",
  "impactReason": "short reason",
  "keyDrivers": ["driver 1", "driver 2"]
}
`,
    });
  }
}
