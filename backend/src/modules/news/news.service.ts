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
      orderBy: { publishedAt: 'desc' },
      take: limit,
    });
  }

  async findById(id: string): Promise<NewsItem> {
    const item = await this.prisma.newsItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException(`News item ${id} not found`);
    return item;
  }

  /** Used by scheduler and POST /news/sync — idempotent, no duplicates. */
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
        mapped.publishedAt,
        event,
      );

      const existing = await this.prisma.newsItem.findUnique({
        where: { externalId },
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
    const externalId = this.resolveExternalId('mock', title, now, {
      idApi: `mock-${Date.now()}`,
      title,
      impact_value: 0,
      dateline: Math.floor(now.getTime() / 1000),
    });

    const existing = await this.prisma.newsItem.findUnique({
      where: { externalId },
    });
    if (existing) return existing;

    return this.prisma.newsItem.create({
      data: {
        externalId,
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
      orderBy: { publishedAt: 'desc' },
      take: limit,
    });
  }

  async findRecentForDashboard(limit = 10) {
    return this.prisma.newsItem.findMany({
      orderBy: { publishedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        source: true,
        publishedAt: true,
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
    publishedAt: Date,
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
    return `${source}:${publishedAt.toISOString()}:${slug}`;
  }

  private mapForexFactoryEvent(event: ForexFactoryNewsEvent): Omit<
    Prisma.NewsItemCreateInput,
    'externalId'
  > & {
    publishedAt: Date;
    source: string;
    title: string;
  } {
    const publishedAt = new Date(event.dateline * 1000);
    const summaryParts = [
      event.country ? `country: ${event.country}` : null,
      event.impact ? `impact: ${event.impact}` : null,
      event.forecast ? `forecast: ${event.forecast}` : null,
      event.previous ? `previous: ${event.previous}` : null,
    ].filter(Boolean);

    return {
      source: NEWS_SOURCE_FOREX_FACTORY,
      title: event.title,
      url: event.details_url,
      summary: summaryParts.length > 0 ? summaryParts.join(' | ') : undefined,
      publishedAt,
      analysisStatus: NewsAnalysisStatus.PENDING,
      rawPayload: event as unknown as Prisma.InputJsonValue,
    };
  }
}
