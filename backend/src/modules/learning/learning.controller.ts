import { Body, Controller, Get, Post } from '@nestjs/common';

// local
import type { CreateLearningRuleDto } from './dto/create-learning-rule.dto';
import { LearningService } from './learning.service';

@Controller('learning-rules')
export class LearningController {
  constructor(private readonly learningService: LearningService) {}

  @Get()
  findAll() {
    return this.learningService.findAll();
  }

  @Post()
  create(@Body() body: CreateLearningRuleDto) {
    return this.learningService.create(body);
  }
}
