/**
 * Future-ready: accumulated PromptImprovements may compile into versioned prompts.
 * Not used at runtime yet — architecture placeholder only.
 */
export type PromptVersionDraft = {
  version: number;
  compiledFromImprovementIds: string[];
  systemPromptAppendix: string;
  createdAt: Date;
};
