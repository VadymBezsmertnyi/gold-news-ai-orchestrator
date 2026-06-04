import { Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';

// local
import type {
  ForexFactoryFetchResult,
  ForexFactoryNewsEvent,
  ImpactBreakdown,
  IndicatorsApiResponse,
  NewsApiResponse,
  SyncTimeWindow,
} from './news-forexfactory.types';
import {
  getNewsSyncFutureHours,
  getNewsSyncPastHours,
} from './news-sync-window';

const FF_BASE_URL = 'https://www.forexfactory.com';
const NEWS_API_URL = `${FF_BASE_URL}/calendar/upcoming/instrument/GoldUSD?limit=100`;

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

  /**
   * Rolling window on eventStartAt (ForexFactory dateline): now − past … now + future.
   */
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

  private getIndicatorsApiUrl(fromDate: Date, toDate: Date): string {
    const fromTimestamp = Math.floor(fromDate.getTime() / 1000);
    return `${FF_BASE_URL.replace(
      'www',
      'mds-api',
    )}/indicators/news?instrument=Gold%2FUSD&interval=M15&from=${fromTimestamp}&site_id=1`;
  }

  async fetchCalendarEvents(): Promise<NewsApiResponse> {
    try {
      const response = await this.http.get<NewsApiResponse>(NEWS_API_URL);
      return response.data;
    } catch (error: unknown) {
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined;
      if (status === 403) {
        this.logger.warn(
          'Forex Factory calendar API returned 403 — returning empty list',
        );
        return { events: [] };
      }
      throw error;
    }
  }

  async fetchIndicatorEvents(
    fromDate: Date,
    toDate: Date,
  ): Promise<NewsApiResponse> {
    const url = this.getIndicatorsApiUrl(fromDate, toDate);
    try {
      const response = await this.http.get<IndicatorsApiResponse>(url);
      const events: ForexFactoryNewsEvent[] = response.data.data.map(
        (item) => ({
          idApi: String(item.id),
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
        }),
      );
      return { events, has_more: false };
    } catch (error: unknown) {
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined;
      if (status === 403) {
        this.logger.warn(
          'Forex Factory indicators API returned 403 — returning empty list',
        );
        return { events: [] };
      }
      throw error;
    }
  }

  dedupeByIdApi(events: ForexFactoryNewsEvent[]): ForexFactoryNewsEvent[] {
    const byId = new Map<string, ForexFactoryNewsEvent>();
    for (const event of events) {
      const idApi = this.resolveIdApi(event);
      if (!idApi) continue;
      const prev = byId.get(idApi);
      byId.set(
        idApi,
        prev ? { ...prev, ...event, idApi } : { ...event, idApi },
      );
    }
    return [...byId.values()];
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

  resolveIdApi(event: ForexFactoryNewsEvent): string | null {
    const raw = event.idApi ?? event.id;
    if (raw == null) return null;
    const id = String(raw).trim();
    return id.length > 0 ? id : null;
  }

  /**
   * Merge calendar upcoming + indicators API; keep only events in the rolling sync window.
   */
  async fetchMergedGoldNews(now = new Date()): Promise<ForexFactoryFetchResult> {
    const range = this.getSyncTimeRange(now);
    const [calendar, indicators] = await Promise.all([
      this.fetchCalendarEvents(),
      this.fetchIndicatorEvents(range.fromDate, range.toDate),
    ]);

    const calendarRaw = calendar.events.length;
    const indicatorsRaw = indicators.events.length;
    const fetchedRaw = calendarRaw + indicatorsRaw;
    const rawMerged = [...calendar.events, ...indicators.events];
    const inWindow = this.filterByTimeWindow(
      rawMerged,
      range.fromSec,
      range.toSec,
    );
    const events = this.dedupeByIdApi(inWindow);

    return {
      calendarRaw,
      indicatorsRaw,
      fetchedRaw,
      afterWindow: inWindow.length,
      afterDedup: events.length,
      timeWindow: {
        from: range.from,
        to: range.to,
        fromSec: range.fromSec,
        toSec: range.toSec,
      },
      impactBreakdown: this.computeImpactBreakdown(events),
      events,
      rawMerged,
    };
  }
}
