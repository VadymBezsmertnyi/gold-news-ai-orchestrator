import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NewsAnalysisStatus, type NewsItem, type Prisma } from '@prisma/client';

// common
import { PrismaService } from '../../common/prisma/prisma.service';

// local
import {
  FOREX_FACTORY_INDICATOR_SOURCE_FILTER,
  FOREX_FACTORY_NEWS_SOURCE_FILTER,
  FOREX_FACTORY_SOURCE_FILTER,
} from './news-forexfactory.constants';
import { NewsForexFactoryClient } from './news-forexfactory.client';
import type {
  ForexFactoryFetchResult,
  ForexFactoryNewsEvent,
  ForexFactorySourceType,
  NewsDebugSourceResult,
  SourceSyncStats,
  SyncNewsResult,
} from './news-forexfactory.types';
import {
  getNewsSyncFutureHours,
  getNewsSyncPastHours,
} from './news-sync-window';

const emptySourceStats = (): SourceSyncStats => ({
  raw: 0,
  afterWindow: 0,
  fallbackCount: 0,
  created: 0,
  updated: 0,
  skipped: 0,
});

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ffClient: NewsForexFactoryClient,
  ) {}

  async findAll(limit = 200): Promise<NewsItem[]> {
    return this.prisma.newsItem.findMany({
      orderBy: { eventStartAt: 'asc' },
      take: limit,
    });
  }

  async findById(id: string): Promise<NewsItem> {
    const item = await this.prisma.newsItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException(`News item ${id} not found`);
    return item;
  }

  async syncNews(): Promise<SyncNewsResult> {
    return this.syncFromForexFactory();
  }

  /**
   * XauSync parity: fetch APIs, apply rolling window, merge with DB cache on 403.
   */
  async fetchMergedWithFallback(
    now = new Date(),
  ): Promise<ForexFactoryFetchResult> {
    const range = this.ffClient.getSyncTimeRange(now);

    const [mdsApi, calendarApi] = await Promise.all([
      this.ffClient.fetchIndicatorsDataToNewsEvents(
        range.fromDate,
        range.toDate,
      ),
      this.ffClient.fetchNewsEvents(),
    ]);

    const apiSlice = this.ffClient.fetchMergedGoldNewsFromApi(
      mdsApi,
      calendarApi,
      range,
    );

    let indicatorsInWindow = apiSlice.indicatorsInWindow;
    let newsInWindow = apiSlice.newsInWindow;
    let indicatorsFallbackCount = 0;
    let newsFallbackCount = 0;

    if (mdsApi.apiStatus === 'forbidden') {
      const cachedIndicators =
        await this.loadCachedIndicatorEventsInWindow(range);
      indicatorsFallbackCount = cachedIndicators.length;
      indicatorsInWindow = this.ffClient.dedupeEvents([
        ...indicatorsInWindow,
        ...cachedIndicators,
      ]);
    }

    if (calendarApi.apiStatus === 'forbidden' && newsInWindow.length === 0) {
      const cachedNews = await this.loadCachedNewsEventsInWindow(range);
      newsFallbackCount = cachedNews.length;
      newsInWindow = this.ffClient.dedupeEvents([
        ...newsInWindow,
        ...cachedNews,
      ]);
      if (newsFallbackCount > 0) {
        this.logger.warn(
          `Calendar API forbidden — loaded ${newsFallbackCount} cached news from DB`,
        );
      } else if (mdsApi.apiStatus === 'ok' && apiSlice.newsRaw.length === 0) {
        this.logger.warn(
          'Calendar API forbidden and no mds-api news in window — DB cache empty for forexfactory:news',
        );
      }
    }

    return this.ffClient.buildFetchResult(
      apiSlice.timeWindow,
      {
        apiStatus: calendarApi.apiStatus,
        apiUrl: calendarApi.apiUrl,
        raw: calendarApi.events,
        inWindow: newsInWindow,
        fallbackCount: newsFallbackCount,
      },
      {
        apiStatus: mdsApi.apiStatus,
        apiUrl: mdsApi.apiUrl,
      },
      {
        raw: apiSlice.newsRaw,
        inWindow: newsInWindow,
        fallbackCount: newsFallbackCount,
      },
      {
        raw: apiSlice.indicatorsRaw,
        inWindow: indicatorsInWindow,
        fallbackCount: indicatorsFallbackCount,
      },
    );
  }

  /** XauSync `getStoredNewsEventsByRange` — regular news rows only. */
  async loadCachedNewsEventsInWindow(range: {
    fromDate: Date;
    toDate: Date;
  }): Promise<ForexFactoryNewsEvent[]> {
    const items = await this.prisma.newsItem.findMany({
      where: {
        source: { in: [...FOREX_FACTORY_NEWS_SOURCE_FILTER.in] },
        eventStartAt: { gte: range.fromDate, lte: range.toDate },
      },
      orderBy: { eventStartAt: 'asc' },
    });
    return items
      .map((item) => this.newsItemToForexFactoryEvent(item, 'NEWS'))
      .filter((e): e is ForexFactoryNewsEvent => e != null);
  }

  async loadCachedIndicatorEventsInWindow(range: {
    fromDate: Date;
    toDate: Date;
  }): Promise<ForexFactoryNewsEvent[]> {
    const items = await this.prisma.newsItem.findMany({
      where: {
        source: { in: [...FOREX_FACTORY_INDICATOR_SOURCE_FILTER.in] },
        eventStartAt: { gte: range.fromDate, lte: range.toDate },
      },
      orderBy: { eventStartAt: 'asc' },
    });
    return items
      .map((item) => this.newsItemToForexFactoryEvent(item, 'INDICATOR'))
      .filter((e): e is ForexFactoryNewsEvent => e != null);
  }

  newsItemToForexFactoryEvent(
    item: NewsItem,
    type: ForexFactorySourceType,
  ): ForexFactoryNewsEvent | null {
    const dateline =
      item.dateline ??
      (item.eventStartAt
        ? Math.floor(item.eventStartAt.getTime() / 1000)
        : null);
    if (dateline == null) return null;

    const payload =
      item.rawPayload != null && typeof item.rawPayload === 'object'
        ? (item.rawPayload as Record<string, unknown>)
        : null;

    let rawIdApi: string | null = null;
    if (payload?.idApi != null) rawIdApi = String(payload.idApi);
    else if (item.idApi) {
      rawIdApi = item.idApi.replace(/^(indicator|news):/i, '');
    }
    if (!rawIdApi) return null;

    const impactValue =
      item.impactValue ??
      (typeof payload?.impact_value === 'number' ? payload.impact_value : 0);

    return {
      idApi: rawIdApi,
      title: item.title,
      impact_value: impactValue,
      dateline,
      country:
        (typeof payload?.country === 'string' ? payload.country : undefined) ??
        undefined,
      date: item.eventDate ?? undefined,
      time: item.eventTime ?? undefined,
      impact:
        (typeof payload?.impact === 'string' ? payload.impact : undefined) ??
        undefined,
      impact_name:
        (typeof payload?.impact_name === 'string'
          ? payload.impact_name
          : undefined) ?? undefined,
      forecast: item.forecast ?? undefined,
      previous: item.previous ?? undefined,
      details_url: item.url ?? undefined,
      forexFactoryType: type,
    };
  }

  async syncFromForexFactory(): Promise<SyncNewsResult> {
    const fetch = await this.fetchMergedWithFallback();

    const indicators = emptySourceStats();
    indicators.raw = fetch.indicators.raw;
    indicators.afterWindow = fetch.indicators.afterWindow;
    indicators.fallbackCount = fetch.indicators.fallbackCount;

    const news = emptySourceStats();
    news.raw = fetch.news.raw;
    news.afterWindow = fetch.news.afterWindow;
    news.fallbackCount = fetch.news.fallbackCount;

    for (const event of fetch.events) {
      const stats = event.forexFactoryType === 'INDICATOR' ? indicators : news;
      const outcome = await this.upsertForexFactoryEvent(event);
      if (outcome === 'created') stats.created++;
      else if (outcome === 'updated') stats.updated++;
      else stats.skipped++;
    }

    const total: SyncNewsResult['total'] = {
      raw: fetch.total.raw,
      afterWindow: fetch.total.afterWindow,
      afterDedup: fetch.total.afterDedup,
      fallbackCount: indicators.fallbackCount + news.fallbackCount,
      created: indicators.created + news.created,
      updated: indicators.updated + news.updated,
      skipped: indicators.skipped + news.skipped,
    };

    const result: SyncNewsResult = {
      timeWindow: fetch.timeWindow,
      newsApiStatus: fetch.newsApiStatus,
      newsApiUrl: fetch.newsUrl,
      indicators,
      news,
      total,
      impactBreakdown: fetch.impactBreakdown,
    };

    this.logger.log(
      `FF sync ${result.timeWindow.from} → ${result.timeWindow.to} ` +
        `newsApi=${result.newsApiStatus} newsRaw=${news.raw} newsFallback=${news.fallbackCount} newsWindow=${news.afterWindow} ` +
        `indicatorsRaw=${indicators.raw} indicatorsFallback=${indicators.fallbackCount} indicatorsWindow=${indicators.afterWindow} ` +
        `merged=${total.afterDedup} saved ops +${total.created}/~${total.updated}`,
    );

    return result;
  }

  private async upsertForexFactoryEvent(
    event: ForexFactoryNewsEvent,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const rawIdApi = this.ffClient.resolveRawIdApi(event);
    if (!rawIdApi) return 'skipped';

    const mapped = this.mapForexFactoryEvent(event, rawIdApi);
    const { externalId, idApi } = mapped;

    const existing = await this.prisma.newsItem.findFirst({
      where: {
        OR: [{ externalId }, { idApi }],
      },
    });

    if (existing) {
      await this.prisma.newsItem.update({
        where: { id: existing.id },
        data: {
          ...mapped,
          analysisStatus: existing.analysisStatus,
          analysisSummary: existing.analysisSummary,
          category: existing.category,
          impactLevel: existing.impactLevel,
          goldImpact: existing.goldImpact,
          analyzedAt: existing.analyzedAt,
          analysisError: existing.analysisError,
        },
      });
      return 'updated';
    }

    await this.prisma.newsItem.create({ data: mapped });
    return 'created';
  }

  async getDebugSource(): Promise<NewsDebugSourceResult> {
    const now = new Date();
    const fetch = await this.fetchMergedWithFallback(now);
    const range = fetch.timeWindow;
    const fromDate = new Date(range.fromSec * 1000);
    const toDate = new Date(range.toSec * 1000);

    const saved = await this.prisma.newsItem.findMany({
      where: {
        source: { in: [...FOREX_FACTORY_SOURCE_FILTER.in] },
        eventStartAt: { gte: fromDate, lte: toDate },
      },
      select: { eventStartAt: true, source: true },
      orderBy: { eventStartAt: 'asc' },
    });

    const oldest = saved[0]?.eventStartAt ?? null;
    const newest = saved[saved.length - 1]?.eventStartAt ?? null;

    const mapSample = (e: ForexFactoryNewsEvent, rawId: string | null) => {
      if (!rawId) return this.mapForexFactoryEvent(e, 'unknown');
      return this.mapForexFactoryEvent(e, rawId);
    };

    return {
      now: now.toISOString(),
      timeWindow: range,
      syncPastHours: getNewsSyncPastHours(),
      syncFutureHours: getNewsSyncFutureHours(),
      newsApiStatus: fetch.newsApiStatus,
      newsApiUrl: fetch.newsUrl,
      mdsApiUrl: fetch.mdsApiUrl,
      mdsApiStatus: fetch.indicatorsApiStatus,
      indicatorsApiUrl: fetch.indicatorsUrl,
      newsRawCount: fetch.news.raw,
      newsFallbackCount: fetch.news.fallbackCount,
      newsAfterWindowCount: fetch.news.afterWindow,
      indicatorsRawCount: fetch.indicators.raw,
      indicatorsFallbackCount: fetch.indicators.fallbackCount,
      indicatorsAfterWindowCount: fetch.indicators.afterWindow,
      mergedAfterWindowCount: fetch.total.afterWindow,
      mergedAfterDedupCount: fetch.total.afterDedup,
      savedCount: saved.length,
      oldestSavedEventStartAt: oldest?.toISOString() ?? null,
      newestSavedEventStartAt: newest?.toISOString() ?? null,
      impactBreakdown: fetch.impactBreakdown,
      samples: {
        indicators: fetch.indicators.events
          .slice(0, 5)
          .map((e) => mapSample(e, this.ffClient.resolveRawIdApi(e))),
        news: fetch.news.events
          .slice(0, 5)
          .map((e) => mapSample(e, this.ffClient.resolveRawIdApi(e))),
      },
    };
  }

  async createMockNews(): Promise<NewsItem> {
    const now = new Date();
    const title = 'Mock: US CPI beats expectations — gold volatility expected';
    const dateline = Math.floor(now.getTime() / 1000);
    const idApi = `mock-${dateline}`;
    const externalId = `mock:${idApi}`;

    const existing = await this.prisma.newsItem.findFirst({
      where: { OR: [{ externalId }, { idApi }] },
    });
    if (existing) return existing;

    return this.prisma.newsItem.create({
      data: {
        externalId,
        idApi,
        dateline,
        eventStartAt: now,
        source: 'mock',
        title,
        url: 'https://example.com/mock-gold-news',
        summary:
          'Educational mock headline for dashboard and prediction pipeline testing.',
        publishedAt: now,
        analysisStatus: NewsAnalysisStatus.PENDING,
        rawPayload: { mock: true, instrument: 'XAUUSD' },
      },
    });
  }

  async count(): Promise<number> {
    return this.prisma.newsItem.count();
  }

  async countByAnalysisStatus(status: NewsAnalysisStatus): Promise<number> {
    return this.prisma.newsItem.count({ where: { analysisStatus: status } });
  }

  async findPendingAnalysis(limit = 5): Promise<NewsItem[]> {
    return this.prisma.newsItem.findMany({
      where: { analysisStatus: NewsAnalysisStatus.PENDING },
      orderBy: { eventStartAt: 'asc' },
      take: limit,
    });
  }

  async findRecentForDashboard(limit = 100) {
    const range = this.ffClient.getSyncTimeRange();
    return this.prisma.newsItem.findMany({
      where: {
        source: { in: [...FOREX_FACTORY_SOURCE_FILTER.in] },
        eventStartAt: {
          gte: range.fromDate,
          lte: range.toDate,
        },
      },
      orderBy: { eventStartAt: 'asc' },
      take: limit,
      select: {
        id: true,
        title: true,
        source: true,
        publishedAt: true,
        eventStartAt: true,
        analysisStatus: true,
        category: true,
        impactLevel: true,
        goldImpact: true,
        analysisSummary: true,
        analyzedAt: true,
      },
    });
  }

  resolveExternalId(
    source: string,
    title: string,
    eventStartAt: Date,
    event?: ForexFactoryNewsEvent,
  ): string {
    const rawId = event ? this.ffClient.resolveRawIdApi(event) : null;
    if (rawId) return `${source}:${rawId}`;

    const slug = title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 120);
    return `${source}:${eventStartAt.toISOString()}:${slug}`;
  }

  private mapForexFactoryEvent(
    event: ForexFactoryNewsEvent,
    rawIdApi: string,
  ): Prisma.NewsItemCreateInput {
    const eventStartAt = new Date(event.dateline * 1000);
    const source = this.ffClient.sourceForType(event.forexFactoryType);
    const idApi = this.ffClient.toStoredIdApi(event.forexFactoryType, rawIdApi);
    const externalId = `${source}:${rawIdApi}`;

    const summaryParts = [
      event.country ? `country: ${event.country}` : null,
      (event.impact_name ?? event.impact)
        ? `impact: ${event.impact_name ?? event.impact}`
        : null,
      event.forecast ? `forecast: ${event.forecast}` : null,
      event.previous ? `previous: ${event.previous}` : null,
    ].filter(Boolean);

    const rawPayload = {
      ...event,
      idApi: rawIdApi,
      forexFactoryType: event.forexFactoryType,
    };

    return {
      idApi,
      externalId,
      dateline: event.dateline,
      eventStartAt,
      impactValue: event.impact_value,
      forecast: event.forecast ?? undefined,
      previous: event.previous ?? undefined,
      eventTime: event.time ?? undefined,
      eventDate: event.date ?? undefined,
      source,
      title: event.title,
      url: event.details_url,
      summary: summaryParts.length > 0 ? summaryParts.join(' | ') : undefined,
      publishedAt: eventStartAt,
      analysisStatus: NewsAnalysisStatus.PENDING,
      rawPayload: rawPayload as unknown as Prisma.InputJsonValue,
    };
  }
}
