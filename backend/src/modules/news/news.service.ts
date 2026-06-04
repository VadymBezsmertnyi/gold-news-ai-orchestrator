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

    const result: SyncNewsResult = {
      fetchedRaw: fetch.fetchedRaw,
      afterDateWindow: fetch.afterDateWindow,
      afterDedup: fetch.afterDedup,
      created,
      updated,
      skipped,
      source: NEWS_SOURCE_FOREX_FACTORY,
      impactBreakdown: fetch.impactBreakdown,
      timeWindow: fetch.timeWindow,
    };

    this.logger.log(
      `FF sync: raw=${result.fetchedRaw} window=${result.afterDateWindow} dedup=${result.afterDedup} +${result.created} ~${result.updated} skip=${result.skipped} impact=${JSON.stringify(result.impactBreakdown)}`,
    );

    return result;
  }

  async getDebugSource(): Promise<NewsDebugSourceResult> {
    const fetch = await this.ffClient.fetchMergedGoldNews();
    const range = fetch.timeWindow;
    const fromDate = new Date(range.fromSec * 1000);
    const toDate = new Date(range.toSec * 1000);

    const totalForexFactory = await this.prisma.newsItem.count({
      where: { source: NEWS_SOURCE_FOREX_FACTORY },
    });
    const inTimeWindow = await this.prisma.newsItem.count({
      where: {
        source: NEWS_SOURCE_FOREX_FACTORY,
        eventStartAt: { gte: fromDate, lte: toDate },
      },
    });

    return {
      timeWindow: range,
      rawFromApi: {
        calendar: fetch.calendarRaw,
        indicators: fetch.indicatorsRaw,
        merged: fetch.fetchedRaw,
        afterDateWindow: fetch.afterDateWindow,
        afterDedup: fetch.afterDedup,
      },
      impactBreakdown: fetch.impactBreakdown,
      database: {
        totalForexFactory,
        inTimeWindow,
      },
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
