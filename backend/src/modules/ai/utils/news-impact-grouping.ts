export type NewsImpactGroup<T> = {
  highImpactNews: T[];
  mediumImpactNews: T[];
  lowImpactNews: T[];
};

export function groupByImpactLevel<T extends { impactLevel?: string | null }>(
  items: T[],
): NewsImpactGroup<T> {
  const highImpactNews: T[] = [];
  const mediumImpactNews: T[] = [];
  const lowImpactNews: T[] = [];

  for (const item of items) {
    const level = (item.impactLevel ?? '').toUpperCase();
    if (level === 'HIGH') highImpactNews.push(item);
    else if (level === 'MEDIUM') mediumImpactNews.push(item);
    else lowImpactNews.push(item);
  }

  return { highImpactNews, mediumImpactNews, lowImpactNews };
}
