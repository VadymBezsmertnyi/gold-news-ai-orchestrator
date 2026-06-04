/** Jaccard similarity on normalized word tokens (0–1). */
export function textSimilarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

export function promptImprovementSimilarity(
  a: { problemType: string; rootCause: string; promptImprovement: string },
  b: { problemType: string; rootCause: string; promptImprovement: string },
): number {
  const typeMatch = a.problemType === b.problemType ? 0.15 : 0;
  const rootSim = textSimilarity(a.rootCause, b.rootCause);
  const promptSim = textSimilarity(a.promptImprovement, b.promptImprovement);
  return Math.min(1, typeMatch + rootSim * 0.25 + promptSim * 0.6);
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}
