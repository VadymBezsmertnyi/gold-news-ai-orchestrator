import { Injectable, NotFoundException } from '@nestjs/common';
import { NewsAnalysisStatus, type NewsItem, type Prisma } from '@prisma/client';

// common
import { PrismaService } from '../../common/prisma/prisma.service';
import { NEWS_SOURCE_FOREX_FACTORY } from '../../constants';

// local
import { NewsForexFactoryClient } from './news-forexfactory.client';
import type {
  ForexFactoryNewsEvent,
  SyncNewsResult,
} from './news-forexfactory.types';

@Injectable()
export class NewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ffClient: NewsForexFactoryClient,
  ) {}

  async findAll(limit = 50): Promise<NewsItem[]> {
    return this.prisma.newsItem.findMany({
      orderBy: { eventStartAt: 'desc' },
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
    const events = await this.ffClient.fetchRollingGoldNews();
    let created = 0;
    let skipped = 0;

    for (const event of events) {
      const mapped = this.mapForexFactoryEvent(event);
      const externalId = this.resolveExternalId(
        mapped.source,
        mapped.title,
        mapped.eventStartAt,
        event,
      );

      const idApi = mapped.idApi ?? undefined;
      const existing = await this.prisma.newsItem.findFirst({
        where: {
          OR: [{ externalId }, ...(idApi ? [{ idApi }] : [])],
        },
      });
      if (existing) {
        skipped++;
        continue;
      }

      await this.prisma.newsItem.create({
        data: { ...mapped, externalId },
      });
      created++;
    }

    return {
      fetched: events.length,
      created,
      skipped,
      source: NEWS_SOURCE_FOREX_FACTORY,
    };
  }

  async createMockNews(): Promise<NewsItem> {
    const now = new Date();
    const title = 'Mock: US CPI beats expectations — gold volatility expected';
    const dateline = Math.floor(now.getTime() / 1000);
    const externalId = this.resolveExternalId('mock', title, now, {
      idApi: `mock-${Date.now()}`,
      title,
      impact_value: 0,
      dateline,
    });

    const existing = await this.prisma.newsItem.findUnique({
      where: { externalId },
    });
    if (existing) return existing;

    return this.prisma.newsItem.create({
      data: {
        externalId,
        idApi: `mock-${dateline}`,
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
      orderBy: { eventStartAt: 'desc' },
      take: limit,
    });
  }

  async findRecentForDashboard(limit = 10) {
    return this.prisma.newsItem.findMany({
      orderBy: { eventStartAt: 'desc' },
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
    const idApi =
      event.idApi != null && String(event.idApi).trim() !== ''
        ? String(event.idApi).trim()
        : undefined;
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
