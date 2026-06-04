import type { PromptImprovementSlice } from '../ai/types/prompt-improvement.types';
import {
  HISTORICAL_REASONING_IMPROVEMENTS_FOOTER,
  HISTORICAL_REASONING_IMPROVEMENTS_HEADER,
} from './prompt-improvement.constants';

/** Inject into agent system prompts (not user payload). */
export function formatHistoricalReasoningImprovementsSection(
  improvements: PromptImprovementSlice[],
): string {
  if (!improvements.length) return '';

  const lines = improvements.map(
    (item, i) =>
      `${i + 1}. [${item.problemType}]\n` +
      `   Root cause: ${item.rootCause}\n` +
      `   Instruction: ${item.promptImprovement}`,
  );

  return [
    HISTORICAL_REASONING_IMPROVEMENTS_HEADER,
    HISTORICAL_REASONING_IMPROVEMENTS_FOOTER,
    '',
    ...lines,
  ].join('\n');
}
