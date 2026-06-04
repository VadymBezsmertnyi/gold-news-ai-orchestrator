export const ROOT_CAUSE_MAX = 220;
export const PROMPT_IMPROVEMENT_MAX = 280;
export const TITLE_MAX = 80;

export function compressText(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.trim()}…`;
}

export function pickShorterText(a: string, b: string): string {
  const ta = a.trim();
  const tb = b.trim();
  if (!ta) return tb;
  if (!tb) return ta;
  return ta.length <= tb.length ? ta : tb;
}

export function truncatePromptPreview(text: string, max = 120): string {
  return compressText(text, max);
}

const MARKET_OPINION_PATTERNS = [
  /\blebanon\b/i,
  /\bhezbollah\b/i,
  /\bceasefire\b/i,
  /\bfed\b/i,
  /\bfomc\b/i,
  /\bcpi\b/i,
  /\beia\b/i,
  /\bgas invent/i,
  /\buk construction\b/i,
  /\brba\b/i,
  /\bjobless claims\b/i,
  /\bunemployment\b.*\bgold\b/i,
  /\busually does not move gold\b/i,
  /\bshould not be used for\b/i,
  /\boverride geopolitical\b/i,
  /\bthree bullish signals\b/i,
  /\b(is|are|means|should)\s+(bullish|bearish|buy|sell)\b/i,
  /\bgold (will|should|must)\b/i,
];

/** Headline-like tokens: multi-word proper nouns / event names in improvement text. */
const EVENT_NAME_PATTERN =
  /\b(US|U\.S\.|EU|UK|China|Israel|Iran|Russia|Ukraine|Lebanon|Hezbollah|Fed|FOMC|CPI|PPI|NFP|EIA|RBA|ECB|BoE)\b[^.]{0,40}\b(data|report|claims|inventory|speech|decision|talks|conflict|war)\b/i;

export function looksLikeMarketSpecificRule(text: string): boolean {
  if (MARKET_OPINION_PATTERNS.some((re) => re.test(text))) return true;
  if (EVENT_NAME_PATTERN.test(text)) return true;
  return false;
}

export function appendPredictionId(
  existing: unknown,
  predictionId: string,
): string[] {
  const ids = Array.isArray(existing)
    ? existing.filter((id): id is string => typeof id === 'string')
    : [];
  if (!ids.includes(predictionId)) ids.push(predictionId);
  return ids;
}
