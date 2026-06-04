import { Injectable } from '@nestjs/common';
import type { LearningRule } from '@prisma/client';

// types
import type { LearningAgentOutput } from '../ai/types/learning-agent.types';
import type { PromptImprovementSlice } from '../ai/types/prompt-improvement.types';

// DTOs
import type { CreateLearningRuleDto } from './dto/create-learning-rule.dto';

// common
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class LearningService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<LearningRule[]> {
    return this.prisma.learningRule.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Active prompt improvements injected into agents (excludes deprecated market rules). */
  async findActivePromptImprovements(): Promise<LearningRule[]> {
    return this.prisma.learningRule.findMany({
      where: {
        isActive: true,
        isDeprecated: false,
        promptImprovement: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** @deprecated Use findActivePromptImprovements — kept for backward-compatible imports. */
  async findActive(): Promise<LearningRule[]> {
    return this.findActivePromptImprovements();
  }

  async findDeprecated(): Promise<LearningRule[]> {
    return this.prisma.learningRule.findMany({
      where: { isDeprecated: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  toPromptImprovementSlices(rules: LearningRule[]): PromptImprovementSlice[] {
    return rules
      .filter(
        (r) =>
          !r.isDeprecated &&
          r.promptImprovement &&
          r.problemType &&
          r.rootCause,
      )
      .map((r) => ({
        id: r.id,
        problemType: r.problemType!,
        rootCause: r.rootCause!,
        promptImprovement: r.promptImprovement!,
      }));
  }

  async create(dto: CreateLearningRuleDto): Promise<LearningRule> {
    return this.prisma.learningRule.create({
      data: {
        problemType: dto.problemType,
        rootCause: dto.rootCause,
        promptImprovement: dto.promptImprovement,
        confidence: dto.confidence,
        sourcePredictionId: dto.sourcePredictionId,
        isActive: dto.isActive ?? true,
        isDeprecated: false,
      },
    });
  }

  async createFromFailedPrediction(
    predictionId: string,
    output: LearningAgentOutput,
  ): Promise<LearningRule> {
    return this.create({
      problemType: output.problemType,
      rootCause: output.rootCause,
      promptImprovement: output.promptImprovement,
      confidence: output.confidence,
      sourcePredictionId: predictionId,
      isActive: true,
    });
  }
}
