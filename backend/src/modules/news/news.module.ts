import { Module } from '@nestjs/common';

// local
import { NewsController } from './news.controller';
import { NewsForexFactoryClient } from './news-forexfactory.client';
import { NewsService } from './news.service';

@Module({
  controllers: [NewsController],
  providers: [NewsService, NewsForexFactoryClient],
  exports: [NewsService],
})
export class NewsModule {}
