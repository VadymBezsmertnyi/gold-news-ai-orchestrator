import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NewsAnalysisStatus, type NewsItem, type Prisma } from '@prisma/client';

// common
import { PrismaService } from '../../common/prisma/prisma.service';
import { NEWS_SOURCE_FOREX_FACTORY } from '../../constants';

// local
import { NewsForexFactoryClient } from './news-forexfactory.client';
import type {
  ForexFactoryNewsEvent,
  NewsDebugSourceResult,
  SyncNewsResult,
} from './news-forexfactory.types';
import {
  getNewsSyncFutureHours,
  getNewsSyncPastHours,
} from './news-sync-window';

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

  async syncFromForexFactory(): Promise<SyncNewsResult> {
    const fetch = await this.ffClient.fetchMergedGoldNews();

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const event of fetch.events) {
      const idApi = this.ffClient.resolveIdApi(event);
      if (!idApi) {
        skipped++;
        continue;
      }

      const mapped = this.mapForexFactoryEvent(event);
      const externalId = `${NEWS_SOURCE_FOREX_FACTORY}:${idApi}`;

      const existing = await this.prisma.newsItem.findFirst({
        where: {
          OR: [{ idApi }, { externalId }],
        },
      });

      if (existing) {
        await this.prisma.newsItem.update({
          where: { id: existing.id },
          data: {
            ...mapped,
            externalId,
            idApi,
            analysisStatus: existing.analysisStatus,
            analysisSummary: existing.analysisSummary,
            category: existing.category,
            impactLevel: existing.impactLevel,
            goldImpact: existing.goldImpact,
            analyzedAt: existing.analyzedAt,
            analysisError: existing.analysisError,
          },
        });
        updated++;
        continue;
      }

      await this.prisma.newsItem.create({
        data: { ...mapped, externalId, idApi },
      });
      created++;
    }

    const pruned = await this.pruneNewsOutsideSyncWindow();

    const result: SyncNewsResult = {
      fetchedRaw: fetch.fetchedRaw,
      afterWindow: fetch.afterWindow,
      afterDedup: fetch.afterDedup,
      created,
      updated,
      skipped,
      pruned,
      source: NEWS_SOURCE_FOREX_FACTORY,
      impactBreakdown: fetch.impactBreakdown,
      timeWindow: fetch.timeWindow,
    };

    this.logger.log(
      `FF sync: window ${result.timeWindow.from} → ${result.timeWindow.to} raw=${result.fetchedRaw} afterWindow=${result.afterWindow} dedup=${result.afterDedup} +${result.created} ~${result.updated} skip=${result.skipped} pruned=${JSON.stringify(result.pruned)} impact=${JSON.stringify(result.impactBreakdown)}`,
    );

    return result;
  }

  /**
   * Remove ForexFactory news (and linked predictions) outside the rolling sync window.
   * For manual cleanup see backend/scripts/prune-news-outside-sync-window.sql
   */
  async pruneNewsOutsideSyncWindow(): Promise<{
    newsItems: number;
    predictions: number;
    predictionResults: number;
  }> {
    const range = this.ffClient.getSyncTimeRange();
    const outsideWhere = {
      source: NEWS_SOURCE_FOREX_FACTORY,
      OR: [
        { eventStartAt: { lt: range.fromDate } },
        { eventStartAt: { gt: range.toDate } },
      ],
    };

    const staleNews = await this.prisma.newsItem.findMany({
      where: outsideWhere,
      select: { id: true },
    });
    const newsIds = staleNews.map((n) => n.id);
    if (newsIds.length === 0) {
      return { newsItems: 0, predictions: 0, predictionResults: 0 };
    }

    const stalePredictions = await this.prisma.prediction.findMany({
      where: { newsItemId: { in: newsIds } },
      select: { id: true },
    });
    const predictionIds = stalePredictions.map((p) => p.id);

    const predictionResults =
      predictionIds.length > 0
        ? await this.prisma.predictionResult.deleteMany({
            where: { predictionId: { in: predictionIds } },
          })
        : { count: 0 };

    const predictions =
      predictionIds.length > 0
        ? await this.prisma.prediction.deleteMany({
            where: { id: { in: predictionIds } },
          })
        : { count: 0 };

    const newsItems = await this.prisma.newsItem.deleteMany({
      where: { id: { in: newsIds } },
    });

    if (newsItems.count > 0) {
      this.logger.log(
        `Pruned outside sync window: news=${newsItems.count} predictions=${predictions.count} results=${predictionResults.count}`,
      );
    }

    return {
      newsItems: newsItems.count,
      predictions: predictions.count,
      predictionResults: predictionResults.count,
    };
  }

  async getDebugSource(): Promise<NewsDebugSourceResult> {
    const now = new Date();
    const fetch = await this.ffClient.fetchMergedGoldNews(now);
    const range = fetch.timeWindow;
    const fromDate = new Date(range.fromSec * 1000);
    const toDate = new Date(range.toSec * 1000);

    const saved = await this.prisma.newsItem.findMany({
      where: {
        source: NEWS_SOURCE_FOREX_FACTORY,
        eventStartAt: { gte: fromDate, lte: toDate },
      },
      select: { eventStartAt: true },
      orderBy: { eventStartAt: 'asc' },
    });

    const oldest = saved[0]?.eventStartAt ?? null;
    const newest = saved[saved.length - 1]?.eventStartAt ?? null;

    return {
      now: now.toISOString(),
      from: range.from,
      to: range.to,
      rawCount: fetch.fetchedRaw,
      afterWindowCount: fetch.afterWindow,
      afterDedupCount: fetch.afterDedup,
      savedCount: saved.length,
      oldestSavedEventStartAt: oldest?.toISOString() ?? null,
      newestSavedEventStartAt: newest?.toISOString() ?? null,
      timeWindow: range,
      syncPastHours: getNewsSyncPastHours(),
      syncFutureHours: getNewsSyncFutureHours(),
      rawFromApi: {
        calendar: fetch.calendarRaw,
        indicators: fetch.indicatorsRaw,
      },
      impactBreakdown: fetch.impactBreakdown,
      samples: {
        raw: fetch.rawMerged.slice(0, 5),
        mapped: fetch.events
          .slice(0, 5)
          .map((e) => this.mapForexFactoryEvent(e)),
      },
    };
  }

  async createMockNews(): Promise<NewsItem> {
    const now = new Date();
    const title = 'Mock: US CPI beats expectations — gold volatility expected';
    const dateline = Math.floor(now.getTime() / 1000);
    const idApi = `mock-${dateline}`;
    const externalId = `${NEWS_SOURCE_FOREX_FACTORY}:${idApi}`;

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
        source: NEWS_SOURCE_FOREX_FACTORY,
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
    const rawId = event?.idApi ?? event?.id;
    if (rawId != null && String(rawId).trim() !== '')
      return `${source}:${String(rawId).trim()}`;

    const slug = title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 120);
    return `${source}:${eventStartAt.toISOString()}:${slug}`;
  }

  private mapForexFactoryEvent(event: ForexFactoryNewsEvent): Omit<
    Prisma.NewsItemCreateInput,
    'externalId'
  > & {
    eventStartAt: Date;
    source: string;
    title: string;
  } {
    const eventStartAt = new Date(event.dateline * 1000);
    const idApi = this.ffClient.resolveIdApi(event) ?? undefined;
    const summaryParts = [
      event.country ? `country: ${event.country}` : null,
      (event.impact_name ?? event.impact)
        ? `impact: ${event.impact_name ?? event.impact}`
        : null,
      event.forecast ? `forecast: ${event.forecast}` : null,
      event.previous ? `previous: ${event.previous}` : null,
    ].filter(Boolean);

    return {
      idApi,
      dateline: event.dateline,
      eventStartAt,
      impactValue: event.impact_value,
      forecast: event.forecast ?? undefined,
      previous: event.previous ?? undefined,
      eventTime: event.time ?? undefined,
      eventDate: event.date ?? undefined,
      source: NEWS_SOURCE_FOREX_FACTORY,
      title: event.title,
      url: event.details_url,
      summary: summaryParts.length > 0 ? summaryParts.join(' | ') : undefined,
      publishedAt: eventStartAt,
      analysisStatus: NewsAnalysisStatus.PENDING,
      rawPayload: event as unknown as Prisma.InputJsonValue,
    };
  }
}
