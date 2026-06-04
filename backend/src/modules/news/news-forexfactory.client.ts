import { Injectable, Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';

// local
import type {
  ForexFactoryNewsEvent,
  IndicatorsApiResponse,
  NewsApiResponse,
} from './news-forexfactory.types';

const FF_BASE_URL = 'https://www.forexfactory.com';
const NEWS_API_URL = `${FF_BASE_URL}/calendar/upcoming/instrument/GoldUSD?limit=100`;
const NEWS_ROLLING_RANGE_HOURS = 6;

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

  getRollingTimeRange(nowMs = Date.now()): {
    fromDate: Date;
    toDate: Date;
    fromSec: number;
    toSec: number;
  } {
    const rangeMs = NEWS_ROLLING_RANGE_HOURS * 60 * 60 * 1000;
    const fromDate = new Date(nowMs - rangeMs);
    const toDate = new Date(nowMs + rangeMs);
    return {
      fromDate,
      toDate,
      fromSec: Math.floor(fromDate.getTime() / 1000),
      toSec: Math.floor(toDate.getTime() / 1000),
    };
  }

  private getIndicatorsApiUrl(fromDate?: Date, toDate?: Date): string {
    const now = toDate ?? new Date();
    const from = fromDate ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fromTimestamp = Math.floor(from.getTime() / 1000);
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
    fromDate?: Date,
    toDate?: Date,
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

  async fetchRollingGoldNews(): Promise<ForexFactoryNewsEvent[]> {
    const range = this.getRollingTimeRange();
    const [calendar, indicators] = await Promise.all([
      this.fetchCalendarEvents(),
      this.fetchIndicatorEvents(range.fromDate, range.toDate),
    ]);
    const raw = [...calendar.events, ...indicators.events];
    return raw.filter(
      (event) =>
        event.dateline >= range.fromSec && event.dateline <= range.toSec,
    );
  }
}
