/** Reusable agent prompt/reasoning adjustment (not a market conclusion). */
export type PromptImprovementSlice = {
  id: string;
  problemType: string;
  rootCause: string;
  promptImprovement: string;
};
