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
  ForexFactoryApiStatus,
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

export interface ForexFactoryApiFetchResult {
  events: ForexFactoryNewsEvent[];
  apiStatus: ForexFactoryApiStatus;
  apiUrl: string;
}

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
  ): Promise<ForexFactoryApiFetchResult> {
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
      return { events, apiStatus: 'ok', apiUrl: url };
    } catch (error: unknown) {
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined;
      if (status === 403) {
        this.logger.warn(
          `Forex Factory indicators API returned 403 — will use cached DB data. URL: ${url}`,
        );
        return { events: [], apiStatus: 'forbidden', apiUrl: url };
      }
      this.logger.error('Error fetching indicators data', error);
      return { events: [], apiStatus: 'error', apiUrl: url };
    }
  }

  /**
   * XauSync: `fetchNewsEvents` — regular news headlines (calendar upcoming).
   */
  async fetchNewsEvents(): Promise<ForexFactoryApiFetchResult> {
    const url = NEWS_API_URL;
    try {
      const response = await this.http.get<NewsApiResponse>(url);
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
      return { events, apiStatus: 'ok', apiUrl: url };
    } catch (error: unknown) {
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined;
      if (status === 403) {
        this.logger.warn(
          `Forex Factory news API returned 403 — will use cached DB data. URL: ${url}`,
        );
        return { events: [], apiStatus: 'forbidden', apiUrl: url };
      }
      this.logger.error('Error fetching news events', error);
      return { events: [], apiStatus: 'error', apiUrl: url };
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
   * API-only fetch (no DB fallback). Service layer applies cache like XauSync index.ts.
   */
  fetchMergedGoldNewsFromApi(
    indicatorsApi: ForexFactoryApiFetchResult,
    newsApi: ForexFactoryApiFetchResult,
    range: SyncTimeWindow & { fromDate: Date; toDate: Date },
  ): Omit<
    ForexFactoryFetchResult,
    'events' | 'total' | 'impactBreakdown' | 'indicators' | 'news'
  > & {
    indicatorsRaw: ForexFactoryNewsEvent[];
    newsRaw: ForexFactoryNewsEvent[];
    indicatorsInWindow: ForexFactoryNewsEvent[];
    newsInWindow: ForexFactoryNewsEvent[];
  } {
    const indicatorsInWindow = this.filterByTimeWindow(
      indicatorsApi.events,
      range.fromSec,
      range.toSec,
    );
    const newsInWindow = this.filterByTimeWindow(
      newsApi.events,
      range.fromSec,
      range.toSec,
    );

    return {
      timeWindow: {
        from: range.from,
        to: range.to,
        fromSec: range.fromSec,
        toSec: range.toSec,
      },
      indicatorsUrl: indicatorsApi.apiUrl,
      newsUrl: newsApi.apiUrl,
      newsApiStatus: newsApi.apiStatus,
      indicatorsApiStatus: indicatorsApi.apiStatus,
      indicatorsRaw: indicatorsApi.events,
      newsRaw: newsApi.events,
      indicatorsInWindow,
      newsInWindow,
    };
  }

  buildFetchResult(
    range: SyncTimeWindow,
    indicatorsApi: {
      apiStatus: ForexFactoryApiStatus;
      apiUrl: string;
      raw: ForexFactoryNewsEvent[];
      inWindow: ForexFactoryNewsEvent[];
      fallbackCount: number;
    },
    newsApi: {
      apiStatus: ForexFactoryApiStatus;
      apiUrl: string;
      raw: ForexFactoryNewsEvent[];
      inWindow: ForexFactoryNewsEvent[];
      fallbackCount: number;
    },
  ): ForexFactoryFetchResult {
    const indicatorsDeduped = this.dedupeEvents(indicatorsApi.inWindow);
    const newsDeduped = this.dedupeEvents(newsApi.inWindow);
    const mergedInWindow = [
      ...indicatorsApi.inWindow,
      ...newsApi.inWindow,
    ];
    const events = this.dedupeEvents(mergedInWindow);

    return {
      timeWindow: range,
      indicatorsUrl: indicatorsApi.apiUrl,
      newsUrl: newsApi.apiUrl,
      newsApiStatus: newsApi.apiStatus,
      indicatorsApiStatus: indicatorsApi.apiStatus,
      indicators: {
        apiStatus: indicatorsApi.apiStatus,
        apiUrl: indicatorsApi.apiUrl,
        raw: indicatorsApi.raw.length,
        afterWindow: indicatorsApi.inWindow.length,
        afterDedup: indicatorsDeduped.length,
        fallbackCount: indicatorsApi.fallbackCount,
        events: indicatorsDeduped,
        rawInWindow: indicatorsApi.inWindow,
      },
      news: {
        apiStatus: newsApi.apiStatus,
        apiUrl: newsApi.apiUrl,
        raw: newsApi.raw.length,
        afterWindow: newsApi.inWindow.length,
        afterDedup: newsDeduped.length,
        fallbackCount: newsApi.fallbackCount,
        events: newsDeduped,
        rawInWindow: newsApi.inWindow,
      },
      total: {
        raw: indicatorsApi.raw.length + newsApi.raw.length,
        afterWindow: mergedInWindow.length,
        afterDedup: events.length,
      },
      impactBreakdown: this.computeImpactBreakdown(events),
      events,
    };
  }
}
