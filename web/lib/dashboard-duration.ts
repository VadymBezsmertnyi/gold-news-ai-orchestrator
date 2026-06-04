/** Human-readable Ukrainian duration (e.g. `45 хв`, `1г 20хв`, `2д 3г`). */
export function formatDurationHumanUk(ms: number): string {
  const totalMins = Math.max(1, Math.ceil(ms / 60_000));
  if (totalMins < 60) return `${totalMins} хв`;

  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const days = Math.floor(hours / 24);
  const hrs = hours % 24;

  if (days >= 1) {
    const parts = [`${days}д`];
    if (hrs > 0) parts.push(`${hrs}г`);
    if (mins > 0) parts.push(`${mins}хв`);
    return parts.join(" ");
  }

  if (mins === 0) return `${hours}г`;
  return `${hours}г ${mins}хв`;
}
