// Packages
import Anthropic from '@anthropic-ai/sdk';

// Types
import { LlmAskJsonParams, LlmProvider } from '../types/llm.types';

export class ClaudeProvider implements LlmProvider {
  private readonly anthropic: Anthropic;

  constructor() {
    if (!process.env.CLAUDE_API_KEY)
      throw new Error('CLAUDE_API_KEY is missing');

    this.anthropic = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY,
    });
  }

  async askJson<T>(params: LlmAskJsonParams): Promise<T> {
    const response = await this.anthropic.messages.create({
      model:
        params.model || process.env.CLAUDE_MODEL_SMART || 'claude-sonnet-4-6',
      max_tokens: params.maxTokens || 1200,
      temperature: params.temperature || 0.2,
      system: params.system,
      messages: [
        {
          role: 'user',
          content: `${params.prompt}\n\nReturn valid JSON only. Do not use markdown.`,
        },
      ],
    });

    const textBlock = response.content.find((item) => item.type === 'text');
    if (!textBlock || textBlock.type !== 'text')
      throw new Error('Claude returned empty response');

    return JSON.parse(textBlock.text) as T;
  }
}
