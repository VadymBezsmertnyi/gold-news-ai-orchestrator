import { Injectable, Logger } from '@nestjs/common';
import type { Prediction, PromptImprovement } from '@prisma/client';

import type { LearningAgentOutput } from '../ai/types/learning-agent.types';
import type { PromptImprovementSlice } from '../ai/types/prompt-improvement.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CreateLearningRuleDto } from './dto/create-learning-rule.dto';
import {
  PROMPT_IMPROVEMENT_DEDUP_THRESHOLD,
  PROMPT_IMPROVEMENT_DEPRECATION_MAX_SUCCESS_RATE,
  PROMPT_IMPROVEMENT_DEPRECATION_MIN_APPLICATIONS,
  PROMPT_IMPROVEMENT_PROBLEM_TYPES,
  type PromptImprovementProblemType,
} from './prompt-improvement.constants';
import { promptImprovementSimilarity } from './prompt-improvement-similarity';

const MARKET_OPINION_PATTERNS = [
  /\blebanon\b/i,
  /\bceasefire\b/i,
  /\buk construction\b/i,
  /\brba\b/i,
  /\bcpi\b.*\bgold\b/i,
  /\busually does not move gold\b/i,
  /\bshould not be used for\b/i,
  /\boverride geopolitical\b/i,
  /\bthree bullish signals\b/i,
];

export type UpsertPromptImprovementResult = {
  record: PromptImprovement;
  created: boolean;
  mergedDuplicate: boolean;
};

@Injectable()
export class LearningService {
  private readonly logger = new Logger(LearningService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<PromptImprovement[]> {
    return this.prisma.promptImprovement.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findActivePromptImprovements(): Promise<PromptImprovement[]> {
    return this.prisma.promptImprovement.findMany({
      where: {
        isDeprecated: false,
        promptImprovement: { not: '' },
      },
      orderBy: [{ successRate: 'desc' }, { createdAt: 'desc' }],
      take: 40,
    });
  }

  async findDeprecated(): Promise<PromptImprovement[]> {
    return this.prisma.promptImprovement.findMany({
      where: { isDeprecated: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  toPromptImprovementSlices(
    rows: PromptImprovement[],
  ): PromptImprovementSlice[] {
    return rows
      .filter(
        (r) =>
          !r.isDeprecated &&
          r.promptImprovement?.trim() &&
          r.problemType?.trim() &&
          r.rootCause?.trim() &&
          this.isAllowedProblemType(r.problemType),
      )
      .map((r) => ({
        id: r.id,
        problemType: r.problemType,
        rootCause: r.rootCause,
        promptImprovement: r.promptImprovement,
      }));
  }

  parseAppliedImprovementIds(prediction: Prediction): string[] {
    const raw = prediction.appliedPromptImprovementIds;
    if (!Array.isArray(raw)) return [];
    return raw.filter((id): id is string => typeof id === 'string');
  }

  async recordApplications(improvementIds: string[]): Promise<void> {
    if (!improvementIds.length) return;
    await this.prisma.promptImprovement.updateMany({
      where: { id: { in: improvementIds }, isDeprecated: false },
      data: {
        timesApplied: { increment: 1 },
        usageCount: { increment: 1 },
        lastAppliedAt: new Date(),
      },
    });
  }

  async recordEvaluationOutcomes(
    improvementIds: string[],
    isSuccess: boolean,
  ): Promise<void> {
    for (const id of improvementIds) {
      const row = await this.prisma.promptImprovement.findUnique({
        where: { id },
      });
      if (!row || row.isDeprecated) continue;

      const successCount = row.successCount + (isSuccess ? 1 : 0);
      const failureCount = row.failureCount + (isSuccess ? 0 : 1);
      const total = successCount + failureCount;
      const successRate = total > 0 ? successCount / total : null;

      await this.prisma.promptImprovement.update({
        where: { id },
        data: { successCount, failureCount, successRate },
      });

      await this.maybeDeprecateByQuality(id, {
        timesApplied: row.timesApplied,
        successRate,
      });
    }
  }

  async recordEvaluationForPrediction(
    prediction: Prediction,
    isSuccess: boolean,
  ): Promise<void> {
    const ids = this.parseAppliedImprovementIds(prediction);
    await this.recordEvaluationOutcomes(ids, isSuccess);
  }

  validateAgentOutput(output: LearningAgentOutput): {
    ok: boolean;
    reason?: string;
    problemType?: PromptImprovementProblemType;
  } {
    if (!output.shouldCreateImprovement) {
      return { ok: false, reason: 'agent_declined' };
    }
    if (!output.promptImprovement?.trim()) {
      return { ok: false, reason: 'empty_prompt_improvement' };
    }

    const problemType = this.normalizeProblemType(output.problemType);
    if (!problemType) {
      return { ok: false, reason: 'invalid_problem_type' };
    }

    const combined = `${output.rootCause} ${output.promptImprovement}`;
    if (this.looksLikeMarketConclusion(combined)) {
      return { ok: false, reason: 'market_conclusion_forbidden' };
    }

    return { ok: true, problemType };
  }

  async upsertFromFailedPrediction(
    predictionId: string,
    output: LearningAgentOutput,
  ): Promise<UpsertPromptImprovementResult | null> {
    const validation = this.validateAgentOutput(output);
    if (!validation.ok || !validation.problemType) return null;

    const candidate = {
      problemType: validation.problemType,
      rootCause: output.rootCause.trim(),
      promptImprovement: output.promptImprovement.trim(),
    };

    const active = await this.findActivePromptImprovements();
    let best: PromptImprovement | null = null;
    let bestSim = 0;

    for (const row of active) {
      const sim = promptImprovementSimilarity(candidate, {
        problemType: row.problemType,
        rootCause: row.rootCause,
        promptImprovement: row.promptImprovement,
      });
      if (sim > bestSim) {
        bestSim = sim;
        best = row;
      }
    }

    if (best && bestSim >= PROMPT_IMPROVEMENT_DEDUP_THRESHOLD) {
      const merged = await this.prisma.promptImprovement.update({
        where: { id: best.id },
        data: {
          occurrences: { increment: 1 },
          usageCount: { increment: 1 },
          confidence: Math.max(best.confidence ?? 0, output.confidence ?? 0),
        },
      });
      this.logger.log(
        `Prompt improvement dedup merge id=${merged.id} similarity=${bestSim.toFixed(2)}`,
      );
      return { record: merged, created: false, mergedDuplicate: true };
    }

    const created = await this.prisma.promptImprovement.create({
      data: {
        problemType: candidate.problemType,
        rootCause: candidate.rootCause,
        promptImprovement: candidate.promptImprovement,
        confidence: output.confidence,
        sourcePredictionId: predictionId,
        isDeprecated: false,
        occurrences: 1,
        usageCount: 0,
        timesApplied: 0,
        successCount: 0,
        failureCount: 0,
      },
    });

    return { record: created, created: true, mergedDuplicate: false };
  }

  async create(dto: CreateLearningRuleDto): Promise<PromptImprovement> {
    const problemType = this.normalizeProblemType(dto.problemType);
    if (!problemType) {
      throw new Error(`Invalid problemType: ${dto.problemType}`);
    }

    return this.prisma.promptImprovement.create({
      data: {
        problemType,
        rootCause: dto.rootCause,
        promptImprovement: dto.promptImprovement,
        confidence: dto.confidence,
        sourcePredictionId: dto.sourcePredictionId,
        isDeprecated: false,
      },
    });
  }

  /** @deprecated Prefer upsertFromFailedPrediction */
  async createFromFailedPrediction(
    predictionId: string,
    output: LearningAgentOutput,
  ): Promise<PromptImprovement> {
    const result = await this.upsertFromFailedPrediction(predictionId, output);
    if (!result) {
      throw new Error('Prompt improvement rejected by validation or dedup');
    }
    return result.record;
  }

  private async maybeDeprecateByQuality(
    id: string,
    stats: { timesApplied: number; successRate: number | null },
  ): Promise<void> {
    if (stats.timesApplied < PROMPT_IMPROVEMENT_DEPRECATION_MIN_APPLICATIONS)
      return;
    if (stats.successRate == null) return;
    if (stats.successRate > PROMPT_IMPROVEMENT_DEPRECATION_MAX_SUCCESS_RATE)
      return;

    await this.prisma.promptImprovement.update({
      where: { id },
      data: { isDeprecated: true, isActive: false },
    });
    this.logger.warn(
      `Prompt improvement deprecated (low successRate=${stats.successRate}): ${id}`,
    );
  }

  private isAllowedProblemType(value: string): value is PromptImprovementProblemType {
    return (PROMPT_IMPROVEMENT_PROBLEM_TYPES as readonly string[]).includes(
      value,
    );
  }

  private normalizeProblemType(
    value: string | undefined,
  ): PromptImprovementProblemType | null {
    if (!value?.trim()) return null;
    const upper = value.trim().toUpperCase().replace(/\s+/g, '_');
    return this.isAllowedProblemType(upper) ? upper : null;
  }

  private looksLikeMarketConclusion(text: string): boolean {
    return MARKET_OPINION_PATTERNS.some((re) => re.test(text));
  }
}
