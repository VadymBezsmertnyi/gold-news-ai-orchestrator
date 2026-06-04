import { Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';

// local
import {
  FF_BASE_URL,
  FF_MDS_BASE_URL,
  FOREX_FACTORY_HTTP_HEADERS,
  NEWS_CALENDAR_API_URL,
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

  /** www.forexfactory.com (calendar upcoming). */
  private readonly wwwHttp: AxiosInstance = axios.create({
    timeout: 15_000,
    headers: {
      ...FOREX_FACTORY_HTTP_HEADERS,
      'Sec-Fetch-Site': 'same-origin',
    },
  });

  /** mds-api.forexfactory.com (breaking news feed — works when www calendar is 403). */
  private readonly mdsHttp: AxiosInstance = axios.create({
    timeout: 15_000,
    headers: {
      ...FOREX_FACTORY_HTTP_HEADERS,
      'Sec-Fetch-Site': 'same-site',
    },
  });

  getNewsCalendarApiUrl(): string {
    return NEWS_CALENDAR_API_URL;
  }

  /** @deprecated */
  getNewsApiUrl(): string {
    return this.getNewsCalendarApiUrl();
  }

  /**
   * XauSync `getIndicatorsApiUrl` — mds-api breaking news + calendar items for Gold.
   * Despite the path name, `/news/{id}` URLs are regular headlines (not calendar).
   */
  getIndicatorsApiUrl(fromDate?: Date, toDate?: Date): string {
    const now = toDate ?? new Date();
    const from = fromDate ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fromTimestamp = Math.floor(from.getTime() / 1000);
    return `${FF_MDS_BASE_URL}/indicators/news?instrument=Gold%2FUSD&interval=M15&from=${fromTimestamp}&site_id=1`;
  }

  getMdsApiUrl(fromDate?: Date, toDate?: Date): string {
    return this.getIndicatorsApiUrl(fromDate, toDate);
  }

  /**
   * mds-api items: `/news/` → breaking news; `/calendar/` → scheduled calendar.
   */
  classifyMdsEventType(url?: string): ForexFactorySourceType {
    if (!url) return 'NEWS';
    if (url.startsWith('/news/') || url.includes('/news/')) return 'NEWS';
    if (url.startsWith('/calendar/') || url.includes('/calendar/')) {
      return 'INDICATOR';
    }
    return 'NEWS';
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
   * XauSync: `fetchIndicatorsDataToNewsEvents` — uses mds-api (not www calendar).
   */
  async fetchIndicatorsDataToNewsEvents(
    fromDate?: Date,
    toDate?: Date,
  ): Promise<ForexFactoryApiFetchResult> {
    const url = this.getMdsApiUrl(fromDate, toDate);
    try {
      const response = await this.mdsHttp.get<IndicatorsApiResponse>(url);
      const events: ForexFactoryNewsEvent[] = response.data.data.map((item) => {
        const type = this.classifyMdsEventType(item.url);
        return {
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
          forexFactoryType: type,
        };
      });
      const newsCount = events.filter(
        (e) => e.forexFactoryType === 'NEWS',
      ).length;
      const indicatorCount = events.length - newsCount;
      this.logger.log(
        `mds-api: ${events.length} events (news=${newsCount} calendar=${indicatorCount})`,
      );
      return { events, apiStatus: 'ok', apiUrl: url };
    } catch (error: unknown) {
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined;
      if (status === 403) {
        this.logger.warn(
          `Forex Factory mds-api returned 403 — will use cached DB data. URL: ${url}`,
        );
        return { events: [], apiStatus: 'forbidden', apiUrl: url };
      }
      this.logger.error('Error fetching mds-api news data', error);
      return { events: [], apiStatus: 'error', apiUrl: url };
    }
  }

  /**
   * XauSync: `fetchNewsEvents` — www calendar/upcoming (optional; often 403 server-side).
   */
  async fetchNewsEvents(): Promise<ForexFactoryApiFetchResult> {
    const url = this.getNewsCalendarApiUrl();
    try {
      const response = await this.wwwHttp.get<NewsApiResponse>(url);
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
          `Forex Factory calendar API returned 403 — regular news still available via mds-api. URL: ${url}`,
        );
        return { events: [], apiStatus: 'forbidden', apiUrl: url };
      }
      this.logger.error('Error fetching calendar news events', error);
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
   * Split mds-api + calendar API into news vs calendar indicator streams (XauSync merge).
   */
  fetchMergedGoldNewsFromApi(
    mdsApi: ForexFactoryApiFetchResult,
    calendarApi: ForexFactoryApiFetchResult,
    range: SyncTimeWindow & { fromDate: Date; toDate: Date },
  ): {
    timeWindow: SyncTimeWindow;
    mdsApiUrl: string;
    calendarApiUrl: string;
    calendarApiStatus: ForexFactoryApiStatus;
    mdsApiStatus: ForexFactoryApiStatus;
    newsRaw: ForexFactoryNewsEvent[];
    indicatorsRaw: ForexFactoryNewsEvent[];
    newsInWindow: ForexFactoryNewsEvent[];
    indicatorsInWindow: ForexFactoryNewsEvent[];
  } {
    const mdsNewsRaw = mdsApi.events.filter(
      (e) => e.forexFactoryType === 'NEWS',
    );
    const mdsIndicatorsRaw = mdsApi.events.filter(
      (e) => e.forexFactoryType === 'INDICATOR',
    );
    const newsRaw = [...calendarApi.events, ...mdsNewsRaw];
    const indicatorsRaw = mdsIndicatorsRaw;

    const newsInWindow = this.filterByTimeWindow(
      newsRaw,
      range.fromSec,
      range.toSec,
    );
    const indicatorsInWindow = this.filterByTimeWindow(
      indicatorsRaw,
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
      mdsApiUrl: mdsApi.apiUrl,
      calendarApiUrl: calendarApi.apiUrl,
      calendarApiStatus: calendarApi.apiStatus,
      mdsApiStatus: mdsApi.apiStatus,
      newsRaw,
      indicatorsRaw,
      newsInWindow,
      indicatorsInWindow,
    };
  }

  buildFetchResult(
    range: SyncTimeWindow,
    calendarApi: {
      apiStatus: ForexFactoryApiStatus;
      apiUrl: string;
      raw: ForexFactoryNewsEvent[];
      inWindow: ForexFactoryNewsEvent[];
      fallbackCount: number;
    },
    mdsApi: {
      apiStatus: ForexFactoryApiStatus;
      apiUrl: string;
    },
    newsStream: {
      raw: ForexFactoryNewsEvent[];
      inWindow: ForexFactoryNewsEvent[];
      fallbackCount: number;
    },
    indicatorsStream: {
      raw: ForexFactoryNewsEvent[];
      inWindow: ForexFactoryNewsEvent[];
      fallbackCount: number;
    },
  ): ForexFactoryFetchResult {
    const indicatorsDeduped = this.dedupeEvents(indicatorsStream.inWindow);
    const newsDeduped = this.dedupeEvents(newsStream.inWindow);
    const mergedInWindow = [
      ...indicatorsStream.inWindow,
      ...newsStream.inWindow,
    ];
    const events = this.dedupeEvents(mergedInWindow);

    return {
      timeWindow: range,
      indicatorsUrl: mdsApi.apiUrl,
      newsUrl: calendarApi.apiUrl,
      mdsApiUrl: mdsApi.apiUrl,
      newsApiStatus: calendarApi.apiStatus,
      indicatorsApiStatus: mdsApi.apiStatus,
      indicators: {
        apiStatus: mdsApi.apiStatus,
        apiUrl: mdsApi.apiUrl,
        raw: indicatorsStream.raw.length,
        afterWindow: indicatorsStream.inWindow.length,
        afterDedup: indicatorsDeduped.length,
        fallbackCount: indicatorsStream.fallbackCount,
        events: indicatorsDeduped,
        rawInWindow: indicatorsStream.inWindow,
      },
      news: {
        apiStatus: calendarApi.apiStatus,
        apiUrl: calendarApi.apiUrl,
        raw: newsStream.raw.length,
        afterWindow: newsStream.inWindow.length,
        afterDedup: newsDeduped.length,
        fallbackCount: newsStream.fallbackCount,
        events: newsDeduped,
        rawInWindow: newsStream.inWindow,
      },
      total: {
        raw: newsStream.raw.length + indicatorsStream.raw.length,
        afterWindow: mergedInWindow.length,
        afterDedup: events.length,
      },
      impactBreakdown: this.computeImpactBreakdown(events),
      events,
    };
  }
}
