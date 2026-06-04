/** `expectedMovePercent` is stored as percent points (0.15 = 0.15%). */
function moveFraction(expectedMovePercent: number): number {
  return expectedMovePercent / 100;
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

/** Remaining distance to target as % of start price. */
export function distanceToTargetPercent(
  startPrice: number | null,
  expectedPrice: number | null,
  currentPrice: number | null,
  direction: string,
): number | null {
  if (startPrice == null || expectedPrice == null || currentPrice == null) {
    return null;
  }
  if (startPrice === 0) return null;

  let gap = 0;
  if (direction === "BUY") gap = Math.max(0, expectedPrice - currentPrice);
  else if (direction === "SELL") gap = Math.max(0, currentPrice - expectedPrice);
  else gap = Math.abs(expectedPrice - currentPrice);

  return (gap / startPrice) * 100;
}
