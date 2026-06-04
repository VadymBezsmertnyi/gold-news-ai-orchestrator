/** Allowed problemType values for PromptImprovement records. */
export const PROMPT_IMPROVEMENT_PROBLEM_TYPES = [
  'CONTEXT_GAP',
  'REASONING_GAP',
  'SIGNAL_WEIGHTING_GAP',
  'CONFIDENCE_GAP',
  'RISK_GAP',
  'DATA_GAP',
  'TIME_WINDOW_GAP',
  'CONFLICTING_SIGNAL_GAP',
] as const;

export type PromptImprovementProblemType =
  (typeof PROMPT_IMPROVEMENT_PROBLEM_TYPES)[number];

export const PROMPT_IMPROVEMENT_DEDUP_THRESHOLD = Number(
  process.env.PROMPT_IMPROVEMENT_DEDUP_THRESHOLD ?? 0.8,
);

/** Deprecate if applied this many times with poor success rate. */
export const PROMPT_IMPROVEMENT_DEPRECATION_MIN_APPLICATIONS = Number(
  process.env.PROMPT_IMPROVEMENT_DEPRECATION_MIN_APPLICATIONS ?? 15,
);

export const PROMPT_IMPROVEMENT_DEPRECATION_MAX_SUCCESS_RATE = Number(
  process.env.PROMPT_IMPROVEMENT_DEPRECATION_MAX_SUCCESS_RATE ?? 0.2,
);

export const HISTORICAL_REASONING_IMPROVEMENTS_HEADER =
  '=== HISTORICAL REASONING IMPROVEMENTS ===';

export const HISTORICAL_REASONING_IMPROVEMENTS_FOOTER = `These are lessons about reasoning quality.
They are NOT market truths.
Apply them only when relevant.`;
