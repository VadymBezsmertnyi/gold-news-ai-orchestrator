// Packages
import OpenAI from 'openai';

// Types
import { LlmAskJsonParams, LlmProvider } from '../types/llm.types';

export class OpenAiProvider implements LlmProvider {
  private readonly openai: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY)
      throw new Error('OPENAI_API_KEY is missing');

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      organization: process.env.OPENAI_ORG_ID || undefined,
      project: process.env.OPENAI_PROJECT_ID || undefined,
    });
  }

  async askJson<T>(params: LlmAskJsonParams): Promise<T> {
    const response = await this.openai.chat.completions.create({
      model: params.model || process.env.OPENAI_MODEL_FAST || 'gpt-4.1-mini',
      temperature: params.temperature || 0.2,
      max_tokens: params.maxTokens || 800,
      response_format: { type: 'json_object' },
      messages: [
        ...(params.system
          ? [
              {
                role: 'system' as const,
                content: params.system,
              },
            ]
          : []),
        {
          role: 'user',
          content: params.prompt,
        },
      ],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) throw new Error('OpenAI returned empty response');

    return JSON.parse(text) as T;
  }
}
