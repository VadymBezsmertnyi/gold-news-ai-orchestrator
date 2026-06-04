// Packages
import { Injectable } from '@nestjs/common';

// Providers
import { ClaudeProvider } from './claude.provider';
import { MockProvider } from './mock.provider';
import { OpenAiProvider } from './openai.provider';

// Types
import {
  LlmAskJsonParams,
  LlmProvider,
  LlmProviderType,
} from '../types/llm.types';

@Injectable()
export class LlmRouterService {
  private readonly providers = new Map<LlmProviderType, LlmProvider>();

  constructor() {
    this.providers.set(LlmProviderType.MOCK, new MockProvider());

    if (process.env.CLAUDE_API_KEY)
      this.providers.set(LlmProviderType.CLAUDE, new ClaudeProvider());
    if (process.env.OPENAI_API_KEY)
      this.providers.set(LlmProviderType.OPENAI, new OpenAiProvider());
  }

  async askJson<T>(params: LlmAskJsonParams): Promise<T> {
    const providerType = params.provider || this.getDefaultProvider();
    const provider = this.providers.get(providerType);
    if (!provider)
      throw new Error(`LLM provider ${providerType} is not configured`);

    return provider.askJson<T>(params);
  }

  private getDefaultProvider(): LlmProviderType {
    const provider = process.env.LLM_DEFAULT_PROVIDER as LlmProviderType;
    if (provider) return provider;
    if (process.env.OPENAI_API_KEY) return LlmProviderType.OPENAI;
    if (process.env.CLAUDE_API_KEY) return LlmProviderType.CLAUDE;

    return LlmProviderType.MOCK;
  }
}
