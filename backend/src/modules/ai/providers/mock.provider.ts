// Types
import { LlmAskJsonParams, LlmProvider } from '../types/llm.types';

export class MockProvider implements LlmProvider {
  async askJson<T>(_params: LlmAskJsonParams): Promise<T> {
    return { mock: true } as T;
  }
}
