// Types
import { LlmAskJsonParams, LlmProvider } from '../types/llm.types';

/**
 * Deterministic mock responses for local demo without API keys.
 * Keeps the full agent pipeline runnable at zero LLM cost.
 */
export class MockProvider implements LlmProvider {
  async askJson<T>(params: LlmAskJsonParams): Promise<T> {
    const prompt = params.prompt.toLowerCase();

    if (prompt.includes('classify') || prompt.includes('category'))
      return {
        category: 'OTHER',
        impactLevel: 'MEDIUM',
        summary: 'Mock classified summary for local demo.',
        reasoning: 'Mock classifier — no external LLM call.',
      } as T;

    if (prompt.includes('gold impact') || prompt.includes('keydrivers'))
      return {
        goldImpact: 'BULLISH',
        expectedVolatility: 'MEDIUM',
        impactReason: 'Mock impact: mild bullish bias on gold for demo.',
        keyDrivers: ['mock_driver_usd', 'mock_driver_rates'],
      } as T;

    if (prompt.includes('globalbias') || prompt.includes('global gold'))
      return {
        globalBias: 'NEUTRAL',
        confidence: 55,
        expectedMovePercent: 0.15,
        timeframeMinutes: 120,
        summary: 'Mock global context: mixed drivers, neutral bias for demo.',
        activeDrivers: ['mock_usd', 'mock_rates'],
        riskNotes: ['mock_volatility'],
      } as T;

    if (
      prompt.includes('shouldcreateimprovement') ||
      prompt.includes('prompt improvement') ||
      prompt.includes('post-mortem')
    )
      return {
        shouldCreateImprovement: false,
        problemType: 'MOCK_SKIP',
        rootCause: 'Mock: no reusable improvement for demo failure.',
        promptImprovement: '',
        confidence: 40,
      } as T;

    if (
      prompt.includes('educational prediction') ||
      prompt.includes('direction')
    )
      return {
        direction: 'BUY',
        confidence: 68,
        expectedMovePercent: 0.25,
        timeframeMinutes: 60,
        reason: 'Mock prediction for local demo pipeline.',
      } as T;

    return { mock: true } as T;
  }
}
