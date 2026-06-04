/** `expectedMovePercent` is stored as percent points (0.15 = 0.15%). */
function moveFraction(expectedMovePercent: number): number {
  return expectedMovePercent / 100;
}

export function displayStartPrice(row: {
  priceAtEventStart: number | null;
  priceAtPrediction: number | null;
}): number | null {
  return row.priceAtEventStart ?? row.priceAtPrediction;
}

/**
 * Active/upcoming: live price from API.
 * Finished: evaluation `priceAfter` when API maps it to `currentLivePrice`.
 */
export function resolveCurrentOrFinalPriceForRow(row: {
  currentLivePrice: number | null;
}): number | null {
  return row.currentLivePrice;
}

export function computeSignedActualMovePercent(
  startPrice: number | null,
  comparisonPrice: number | null,
): number | null {
  if (startPrice == null || comparisonPrice == null || startPrice === 0) {
    return null;
  }
  return ((comparisonPrice - startPrice) / startPrice) * 100;
}

export function formatSignedMovePercent(value: number | null): string {
  if (value == null) return "—";
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

export function displaySignedActualMovePercent(row: {
  priceAtEventStart: number | null;
  priceAtPrediction: number | null;
  currentLivePrice: number | null;
}): number | null {
  const start = displayStartPrice(row);
  const price = resolveCurrentOrFinalPriceForRow(row);
  return computeSignedActualMovePercent(start, price);
}

export function resolveStartPrice(row: {
  missingEventStartPrice: boolean;
  priceAtEventStart: number | null;
  priceAtPrediction: number | null;
}): number | null {
  if (row.missingEventStartPrice) return null;
  return row.priceAtEventStart ?? row.priceAtPrediction;
}

export function computeExpectedPrice(
  startPrice: number | null,
  expectedMovePercent: number | null,
  direction: string,
): number | null {
  if (startPrice == null || expectedMovePercent == null) return null;
  const move = moveFraction(expectedMovePercent);
  if (direction === "BUY") return startPrice * (1 + move);
  if (direction === "SELL") return startPrice * (1 - move);
  return startPrice * (1 + move);
}
