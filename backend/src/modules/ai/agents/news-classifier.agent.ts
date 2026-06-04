// Packages
import { Injectable } from '@nestjs/common';

// Services
import { LlmRouterService } from '../providers/llm-router.service';

// Types
import { LlmProviderType } from '../types/llm.types';
import {
  NewsClassifierInput,
  NewsClassifierOutput,
} from '../types/news-classifier.types';

@Injectable()
export class NewsClassifierAgent {
  constructor(private readonly llmRouter: LlmRouterService) {}

  async run(input: NewsClassifierInput): Promise<NewsClassifierOutput> {
    return this.llmRouter.askJson<NewsClassifierOutput>({
      provider: LlmProviderType.OPENAI,
      model: process.env.OPENAI_MODEL_FAST || 'gpt-4.1-mini',
      temperature: 0.1,
      maxTokens: 500,
      system:
        'You are a financial news classifier for educational XAUUSD analytics. You classify news only. You do not provide financial advice.',
      prompt: `
Classify this news item for gold / XAUUSD analysis.

News:
{
  "title": "${input.title}",
  "summary": "${input.summary || ''}",
  "source": "${input.source}",
  "publishedAt": "${input.publishedAt.toISOString()}"
}

Return JSON:
{
  "category": "FED_RATES | INFLATION | EMPLOYMENT | USD | GEOPOLITICS | CENTRAL_BANK | MARKET_SENTIMENT | OTHER",
  "impactLevel": "LOW | MEDIUM | HIGH",
  "summary": "short normalized summary",
  "reasoning": "short explanation why this category and impact were selected"
}
`,
    });
  }
}
