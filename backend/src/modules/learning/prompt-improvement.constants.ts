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

export const LEARNING_DECLINE_REASONS = [
  'MARKET_NOISE',
  'INSUFFICIENT_EVIDENCE',
  'DATA_GAP',
  'PRICE_HISTORY_GAP',
  'DUPLICATE_EXISTING',
  'TOO_MARKET_SPECIFIC',
  'MARKET_SPECIFIC_RULE',
] as const;

export type LearningDeclineReason = (typeof LEARNING_DECLINE_REASONS)[number];

export const PROMPT_IMPROVEMENT_DEDUP_THRESHOLD = Number(
  process.env.PROMPT_IMPROVEMENT_DEDUP_THRESHOLD ?? 0.8,
);

/** Candidate → ACTIVE when occurrences >= this (or manualPromote). */
export const LEARNING_PROMOTION_THRESHOLD = Number(
  process.env.LEARNING_PROMOTION_THRESHOLD ?? 2,
);

/** Max ACTIVE improvements injected into agent prompts. */
export const LEARNING_ACTIVE_PROMPT_LIMIT = Number(
  process.env.LEARNING_ACTIVE_PROMPT_LIMIT ?? 5,
);

/** Deprecate ACTIVE if applied this many times with poor success rate. */
export const PROMPT_IMPROVEMENT_DEPRECATION_MIN_APPLICATIONS = Number(
  process.env.PROMPT_IMPROVEMENT_DEPRECATION_MIN_APPLICATIONS ?? 5,
);

export const PROMPT_IMPROVEMENT_DEPRECATION_MAX_SUCCESS_RATE = Number(
  process.env.PROMPT_IMPROVEMENT_DEPRECATION_MAX_SUCCESS_RATE ?? 0.4,
);

export const HISTORICAL_REASONING_IMPROVEMENTS_HEADER =
  '=== HISTORICAL REASONING IMPROVEMENTS ===';

export const HISTORICAL_REASONING_IMPROVEMENTS_FOOTER = `These are lessons about reasoning quality.
They are NOT market truths.
Apply them only when relevant.`;
