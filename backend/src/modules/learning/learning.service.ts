import { Injectable } from '@nestjs/common';
import type { LearningRule } from '@prisma/client';

// common
import { PrismaService } from '../../common/prisma/prisma.service';

// local
import type { CreateLearningRuleDto } from './dto/create-learning-rule.dto';

@Injectable()
export class LearningService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<LearningRule[]> {
    return this.prisma.learningRule.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateLearningRuleDto): Promise<LearningRule> {
    return this.prisma.learningRule.create({
      data: {
        title: dto.title,
        description: dto.description,
        sourcePredictionId: dto.sourcePredictionId,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async createFromFailedPrediction(
    predictionId: string,
    title: string,
    description: string,
  ): Promise<LearningRule> {
    return this.create({
      title,
      description,
      sourcePredictionId: predictionId,
      isActive: true,
    });
  }
}
