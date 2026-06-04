export enum LlmProviderType {
  MOCK = 'mock',
  CLAUDE = 'claude',
  OPENAI = 'openai',
}

export type LlmModelConfig = {
  provider: LlmProviderType;
  model: string;
};

export type LlmAskJsonParams = {
  provider?: LlmProviderType;
  model?: string;
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
};

export interface LlmProvider {
  askJson<T>(params: LlmAskJsonParams): Promise<T>;
}
