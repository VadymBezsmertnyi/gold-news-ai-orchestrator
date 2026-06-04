import { Controller, Get, Param, Post } from '@nestjs/common';

// local
import { NewsService } from './news.service';

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  findAll() {
    return this.newsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.newsService.findById(id);
  }

  @Post('sync')
  sync() {
    return this.newsService.syncNews();
  }

  @Post('mock')
  createMock() {
    return this.newsService.createMockNews();
  }
}
