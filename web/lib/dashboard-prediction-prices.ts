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
