import { Injectable, NotFoundException } from '@nestjs/common';
import { NewsAnalysisStatus, type NewsItem, type Prisma } from '@prisma/client';

// common
import { PrismaService } from '../../common/prisma/prisma.service';
import { NEWS_SOURCE_FOREX_FACTORY } from '../../constants';

// local
import { NewsForexFactoryClient } from './news-forexfactory.client';
import type { ForexFactoryNewsEvent, SyncNewsResult } from './news-forexfactory.types';

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

  /** Used by scheduler and POST /news/sync */
  async syncNews(): Promise<SyncNewsResult> {
    return this.syncFromForexFactory();
  }

  async syncFromForexFactory(): Promise<SyncNewsResult> {
    const events = await this.ffClient.fetchRollingGoldNews();
    let synced = 0;
    let skipped = 0;

    for (const event of events) {
      const mapped = this.mapForexFactoryEvent(event);
      if (!mapped.externalId) {
        skipped++;
        continue;
      }
      const existing = await this.prisma.newsItem.findUnique({
        where: { externalId: mapped.externalId },
      });
      if (existing) {
        skipped++;
        continue;
      }
      await this.prisma.newsItem.create({ data: mapped });
      synced++;
    }

    return { synced, skipped, source: NEWS_SOURCE_FOREX_FACTORY };
  }

  async createMockNews(): Promise<NewsItem> {
    const now = new Date();
    return this.prisma.newsItem.create({
      data: {
        externalId: `mock-${Date.now()}`,
        source: 'mock',
        title: 'Mock: US CPI beats expectations — gold volatility expected',
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

  private mapForexFactoryEvent(
    event: ForexFactoryNewsEvent,
  ): Prisma.NewsItemCreateInput {
    const externalId = String(event.idApi ?? event.id ?? '');
    const publishedAt = new Date(event.dateline * 1000);
    const summaryParts = [
      event.country ? `country: ${event.country}` : null,
      event.impact ? `impact: ${event.impact}` : null,
      event.forecast ? `forecast: ${event.forecast}` : null,
      event.previous ? `previous: ${event.previous}` : null,
    ].filter(Boolean);

    return {
      externalId: externalId || undefined,
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
