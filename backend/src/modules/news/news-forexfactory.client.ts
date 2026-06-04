import { Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';

// local
import {
  FF_BASE_URL,
  NEWS_API_URL,
  NEWS_SOURCE_FOREX_FACTORY_INDICATOR,
  NEWS_SOURCE_FOREX_FACTORY_NEWS,
} from './news-forexfactory.constants';
import type {
  ForexFactoryFetchResult,
  ForexFactoryNewsEvent,
  ForexFactorySourceType,
  ImpactBreakdown,
  IndicatorsApiResponse,
  NewsApiResponse,
  SyncTimeWindow,
} from './news-forexfactory.types';
import {
  getNewsSyncFutureHours,
  getNewsSyncPastHours,
} from './news-sync-window';

@Injectable()
export class NewsForexFactoryClient {
  private readonly logger = new Logger(NewsForexFactoryClient.name);
  private readonly http: AxiosInstance = axios.create({
    timeout: 15_000,
    headers: {
      Accept: 'application/json, text/plain, */*',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      Referer: FF_BASE_URL,
    },
  });

  getNewsApiUrl(): string {
    return NEWS_API_URL;
  }

  /** Same as XauSync `getIndicatorsApiUrl`. */
  getIndicatorsApiUrl(fromDate?: Date, toDate?: Date): string {
    const now = toDate ?? new Date();
    const from = fromDate ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fromTimestamp = Math.floor(from.getTime() / 1000);
    return `${FF_BASE_URL.replace(
      'www',
      'mds-api',
    )}/indicators/news?instrument=Gold%2FUSD&interval=M15&from=${fromTimestamp}&site_id=1`;
  }

  getSyncTimeRange(now = new Date()): SyncTimeWindow & {
    fromDate: Date;
    toDate: Date;
  } {
    const pastMs = getNewsSyncPastHours() * 60 * 60 * 1000;
    const futureMs = getNewsSyncFutureHours() * 60 * 60 * 1000;
    const fromDate = new Date(now.getTime() - pastMs);
    const toDate = new Date(now.getTime() + futureMs);
    const fromSec = Math.floor(fromDate.getTime() / 1000);
    const toSec = Math.floor(toDate.getTime() / 1000);

    return {
      fromDate,
      toDate,
      fromSec,
      toSec,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    };
  }

  /**
   * XauSync: `fetchIndicatorsDataToNewsEvents` — scheduled calendar indicators.
   */
  async fetchIndicatorsDataToNewsEvents(
    fromDate?: Date,
    toDate?: Date,
  ): Promise<NewsApiResponse> {
    const url = this.getIndicatorsApiUrl(fromDate, toDate);
    try {
      const response = await this.http.get<IndicatorsApiResponse>(url);
      const events: ForexFactoryNewsEvent[] = response.data.data.map(
        (item) => ({
          idApi: item.id.toString(),
          title: item.title,
          impact_value: item.impact_value,
          dateline: item.timestamp,
          country: item.country,
          date: new Date(item.timestamp * 1000).toISOString().split('T')[0],
          time: new Date(item.timestamp * 1000)
            .toISOString()
            .split('T')[1]
            .slice(0, 5),
          impact: item.impact,
          impact_name: item.impact,
          details_url: item.url ? `${FF_BASE_URL}${item.url}` : undefined,
          forexFactoryType: 'INDICATOR' as const,
        }),
      );
      return { events, has_more: false };
    } catch (error: unknown) {
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined;
      if (status === 403) {
        this.logger.warn(
          `Forex Factory indicators API returned 403 — using cached DB data. URL: ${url}`,
        );
        return { events: [], has_more: false };
      }
      this.logger.error('Error fetching indicators data', error);
      throw error;
    }
  }

  /**
   * XauSync: `fetchNewsEvents` — regular news headlines (calendar upcoming).
   */
  async fetchNewsEvents(): Promise<NewsApiResponse> {
    try {
      const response = await this.http.get<NewsApiResponse>(NEWS_API_URL);
      const events: ForexFactoryNewsEvent[] = response.data.events.map(
        (event) => ({
          ...event,
          idApi:
            event.idApi != null
              ? String(event.idApi)
              : event.id != null
                ? String(event.id)
                : undefined,
          forexFactoryType: 'NEWS' as const,
        }),
      );
      return { events, has_more: response.data.has_more };
    } catch (error: unknown) {
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined;
      if (status === 403) {
        this.logger.warn(
          `Forex Factory news API returned 403 — using cached DB data. URL: ${NEWS_API_URL}`,
        );
        return { events: [], has_more: false };
      }
      this.logger.error('Error fetching news events', error);
      throw error;
    }
  }

  filterByTimeWindow(
    events: ForexFactoryNewsEvent[],
    fromSec: number,
    toSec: number,
  ): ForexFactoryNewsEvent[] {
    return events.filter(
      (event) => event.dateline >= fromSec && event.dateline <= toSec,
    );
  }

  normalizeTitle(title: string): string {
    return title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 120);
  }

  resolveRawIdApi(event: ForexFactoryNewsEvent): string | null {
    const raw = event.idApi ?? event.id;
    if (raw == null) return null;
    const id = String(raw).trim();
    return id.length > 0 ? id : null;
  }

  /** Stored idApi — scoped by source type so indicator/news ids never collide. */
  toStoredIdApi(sourceType: ForexFactorySourceType, rawIdApi: string): string {
    return `${sourceType.toLowerCase()}:${rawIdApi}`;
  }

  sourceForType(sourceType: ForexFactorySourceType): string {
    return sourceType === 'INDICATOR'
      ? NEWS_SOURCE_FOREX_FACTORY_INDICATOR
      : NEWS_SOURCE_FOREX_FACTORY_NEWS;
  }

  externalIdForEvent(event: ForexFactoryNewsEvent): string | null {
    const rawId = this.resolveRawIdApi(event);
    if (!rawId) return null;
    return `${this.sourceForType(event.forexFactoryType)}:${rawId}`;
  }

  /**
   * Dedup priority: idApi+sourceType → externalId → dateline+normalized title (per type).
   */
  dedupeEvents(events: ForexFactoryNewsEvent[]): ForexFactoryNewsEvent[] {
    const byPrimary = new Map<string, ForexFactoryNewsEvent>();
    const externalAlias = new Map<string, string>();
    const titleAlias = new Map<string, string>();

    for (const event of events) {
      const rawId = this.resolveRawIdApi(event);
      const type = event.forexFactoryType;
      const titleKey = `${event.dateline}:${this.normalizeTitle(event.title)}:${type}`;
      const externalId = rawId ? `${this.sourceForType(type)}:${rawId}` : null;

      let primaryKey = rawId ? `id:${rawId}:${type}` : `title:${titleKey}`;

      if (externalId && externalAlias.has(externalId)) {
        primaryKey = externalAlias.get(externalId)!;
      } else if (titleAlias.has(titleKey)) {
        primaryKey = titleAlias.get(titleKey)!;
      }

      const prev = byPrimary.get(primaryKey);
      const merged: ForexFactoryNewsEvent = prev
        ? {
            ...prev,
            ...event,
            idApi: rawId ?? prev.idApi,
            forexFactoryType: type,
          }
        : { ...event, idApi: rawId ?? event.idApi, forexFactoryType: type };

      byPrimary.set(primaryKey, merged);
      if (externalId) externalAlias.set(externalId, primaryKey);
      titleAlias.set(titleKey, primaryKey);
    }

    return [...byPrimary.values()];
  }

  computeImpactBreakdown(events: ForexFactoryNewsEvent[]): ImpactBreakdown {
    const breakdown: ImpactBreakdown = {
      high: 0,
      medium: 0,
      low: 0,
      other: 0,
    };
    for (const event of events) {
      const label = (event.impact_name ?? event.impact ?? '').toLowerCase();
      if (label.includes('high')) breakdown.high += 1;
      else if (label.includes('medium') || label.includes('med'))
        breakdown.medium += 1;
      else if (label.includes('low')) breakdown.low += 1;
      else breakdown.other += 1;
    }
    return breakdown;
  }

  /**
   * XauSync strategy: indicators + news APIs, rolling window on dateline, then dedupe.
   */
  async fetchMergedGoldNews(
    now = new Date(),
  ): Promise<ForexFactoryFetchResult> {
    const range = this.getSyncTimeRange(now);
    const indicatorsUrl = this.getIndicatorsApiUrl(
      range.fromDate,
      range.toDate,
    );
    const newsUrl = this.getNewsApiUrl();

    const [indicatorsResponse, newsResponse] = await Promise.all([
      this.fetchIndicatorsDataToNewsEvents(range.fromDate, range.toDate),
      this.fetchNewsEvents(),
    ]);

    const indicatorsRaw = indicatorsResponse.events;
    const newsRaw = newsResponse.events;

    const indicatorsInWindow = this.filterByTimeWindow(
      indicatorsRaw,
      range.fromSec,
      range.toSec,
    );
    const newsInWindow = this.filterByTimeWindow(
      newsRaw,
      range.fromSec,
      range.toSec,
    );

    const indicatorsDeduped = this.dedupeEvents(indicatorsInWindow);
    const newsDeduped = this.dedupeEvents(newsInWindow);

    const mergedInWindow = [...indicatorsInWindow, ...newsInWindow];
    const events = this.dedupeEvents(mergedInWindow);

    return {
      timeWindow: {
        from: range.from,
        to: range.to,
        fromSec: range.fromSec,
        toSec: range.toSec,
      },
      indicatorsUrl,
      newsUrl,
      indicators: {
        raw: indicatorsRaw.length,
        afterWindow: indicatorsInWindow.length,
        afterDedup: indicatorsDeduped.length,
        events: indicatorsDeduped,
        rawInWindow: indicatorsInWindow,
      },
      news: {
        raw: newsRaw.length,
        afterWindow: newsInWindow.length,
        afterDedup: newsDeduped.length,
        events: newsDeduped,
        rawInWindow: newsInWindow,
      },
      total: {
        raw: indicatorsRaw.length + newsRaw.length,
        afterWindow: mergedInWindow.length,
        afterDedup: events.length,
      },
      impactBreakdown: this.computeImpactBreakdown(events),
      events,
    };
  }
}
