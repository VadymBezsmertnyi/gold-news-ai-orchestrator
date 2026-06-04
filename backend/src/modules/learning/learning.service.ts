import { Injectable, Logger } from '@nestjs/common';
import {
  PromptImprovementStatus,
  type Prediction,
  type PromptImprovement,
} from '@prisma/client';

import type { LearningAgentOutput } from '../ai/types/learning-agent.types';
import type { PromptImprovementSlice } from '../ai/types/prompt-improvement.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CreateLearningRuleDto } from './dto/create-learning-rule.dto';
import {
  LEARNING_ACTIVE_PROMPT_LIMIT,
  LEARNING_PROMOTION_THRESHOLD,
  PROMPT_IMPROVEMENT_DEDUP_THRESHOLD,
  PROMPT_IMPROVEMENT_DEPRECATION_MAX_SUCCESS_RATE,
  PROMPT_IMPROVEMENT_DEPRECATION_MIN_APPLICATIONS,
  PROMPT_IMPROVEMENT_PROBLEM_TYPES,
  type PromptImprovementProblemType,
} from './prompt-improvement.constants';
import { promptImprovementSimilarity } from './prompt-improvement-similarity';
import {
  appendPredictionId,
  compressText,
  looksLikeMarketSpecificRule,
  pickShorterText,
  PROMPT_IMPROVEMENT_MAX,
  ROOT_CAUSE_MAX,
  truncatePromptPreview,
} from './prompt-improvement-text';

export type UpsertPromptImprovementResult = {
  record: PromptImprovement;
  created: boolean;
  mergedDuplicate: boolean;
  promoted: boolean;
};

export type PromptImprovementDashboardCounts = {
  active: number;
  candidate: number;
  deprecated: number;
  rejected: number;
};

export type PromptImprovementDashboardItem = {
  id: string;
  problemType: string;
  status: PromptImprovementStatus;
  occurrences: number;
  confidence: number | null;
  successRate: number | null;
  promptImprovementPreview: string;
  rootCause: string;
  promptImprovement: string;
  sourcePredictionId: string | null;
  createdAt: Date;
  lastSeenAt: Date | null;
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

  /** Only ACTIVE rows — injected into PredictionAgent / GlobalMarketContextAgent. */
  async findActivePromptImprovements(): Promise<PromptImprovement[]> {
    return this.prisma.promptImprovement.findMany({
      where: {
        status: PromptImprovementStatus.ACTIVE,
        promptImprovement: { not: '' },
      },
      orderBy: [
        { successRate: 'desc' },
        { occurrences: 'desc' },
        { confidence: 'desc' },
        { lastSeenAt: 'desc' },
      ],
      take: LEARNING_ACTIVE_PROMPT_LIMIT,
    });
  }

  async findForDashboard(): Promise<{
    counts: PromptImprovementDashboardCounts;
    items: PromptImprovementDashboardItem[];
  }> {
    const rows = await this.prisma.promptImprovement.findMany({
      where: {
        promptImprovement: { not: '' },
        status: { not: PromptImprovementStatus.REJECTED },
      },
      orderBy: [
        { status: 'asc' },
        { occurrences: 'desc' },
        { lastSeenAt: 'desc' },
      ],
      take: 40,
    });

    const counts = await this.countByStatus();

    return {
      counts,
      items: rows.map((r) => this.toDashboardItem(r)),
    };
  }

  async findDeprecated(): Promise<PromptImprovement[]> {
    return this.prisma.promptImprovement.findMany({
      where: { status: PromptImprovementStatus.DEPRECATED },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  private async countByStatus(): Promise<PromptImprovementDashboardCounts> {
    const grouped = await this.prisma.promptImprovement.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const map = new Map(grouped.map((g) => [g.status, g._count._all]));
    return {
      active: map.get(PromptImprovementStatus.ACTIVE) ?? 0,
      candidate: map.get(PromptImprovementStatus.CANDIDATE) ?? 0,
      deprecated: map.get(PromptImprovementStatus.DEPRECATED) ?? 0,
      rejected: map.get(PromptImprovementStatus.REJECTED) ?? 0,
    };
  }

  toPromptImprovementSlices(
    rows: PromptImprovement[],
  ): PromptImprovementSlice[] {
    return rows
      .filter(
        (r) =>
          r.status === PromptImprovementStatus.ACTIVE &&
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
      where: {
        id: { in: improvementIds },
        status: PromptImprovementStatus.ACTIVE,
      },
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
      if (!row || row.status !== PromptImprovementStatus.ACTIVE) continue;

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
      return {
        ok: false,
        reason: output.declineReason?.trim() || 'agent_declined',
      };
    }
    if (!output.promptImprovement?.trim()) {
      return { ok: false, reason: 'empty_prompt_improvement' };
    }

    const problemType = this.normalizeProblemType(output.problemType);
    if (!problemType) {
      return { ok: false, reason: 'invalid_problem_type' };
    }

    const combined = `${output.rootCause} ${output.promptImprovement}`;
    if (looksLikeMarketSpecificRule(combined)) {
      return { ok: false, reason: 'MARKET_SPECIFIC_RULE' };
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
      rootCause: compressText(output.rootCause.trim(), ROOT_CAUSE_MAX),
      promptImprovement: compressText(
        output.promptImprovement.trim(),
        PROMPT_IMPROVEMENT_MAX,
      ),
    };

    const pool = await this.prisma.promptImprovement.findMany({
      where: {
        status: {
          in: [
            PromptImprovementStatus.CANDIDATE,
            PromptImprovementStatus.ACTIVE,
          ],
        },
      },
    });

    let best: PromptImprovement | null = null;
    let bestSim = 0;

    for (const row of pool) {
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

    const now = new Date();

    if (best && bestSim >= PROMPT_IMPROVEMENT_DEDUP_THRESHOLD) {
      const occurrences = best.occurrences + 1;
      const promoted =
        best.status === PromptImprovementStatus.CANDIDATE &&
        (occurrences >= LEARNING_PROMOTION_THRESHOLD || best.manualPromote);

      const merged = await this.prisma.promptImprovement.update({
        where: { id: best.id },
        data: {
          occurrences,
          lastSeenAt: now,
          confidence: Math.max(best.confidence ?? 0, output.confidence ?? 0),
          rootCause: pickShorterText(best.rootCause, candidate.rootCause),
          promptImprovement: pickShorterText(
            best.promptImprovement,
            candidate.promptImprovement,
          ),
          sourcePredictionIds: appendPredictionId(
            best.sourcePredictionIds,
            predictionId,
          ),
          ...(promoted
            ? {
                status: PromptImprovementStatus.ACTIVE,
                isActive: true,
                isDeprecated: false,
              }
            : {}),
        },
      });

      if (promoted) {
        this.logger.log(
          `Prompt improvement promoted to ACTIVE id=${merged.id} occurrences=${occurrences}`,
        );
      } else {
        this.logger.log(
          `Prompt improvement candidate merge id=${merged.id} sim=${bestSim.toFixed(2)} occurrences=${occurrences}`,
        );
      }

      return {
        record: merged,
        created: false,
        mergedDuplicate: true,
        promoted,
      };
    }

    const created = await this.prisma.promptImprovement.create({
      data: {
        problemType: candidate.problemType,
        rootCause: candidate.rootCause,
        promptImprovement: candidate.promptImprovement,
        confidence: output.confidence,
        status: PromptImprovementStatus.CANDIDATE,
        sourcePredictionId: predictionId,
        sourcePredictionIds: [predictionId],
        isDeprecated: false,
        isActive: true,
        occurrences: 1,
        lastSeenAt: now,
        usageCount: 0,
        timesApplied: 0,
        successCount: 0,
        failureCount: 0,
      },
    });

    this.logger.log(
      `Prompt improvement CANDIDATE created id=${created.id} type=${created.problemType}`,
    );

    return {
      record: created,
      created: true,
      mergedDuplicate: false,
      promoted: false,
    };
  }

  async create(dto: CreateLearningRuleDto): Promise<PromptImprovement> {
    const problemType = this.normalizeProblemType(dto.problemType);
    if (!problemType) {
      throw new Error(`Invalid problemType: ${dto.problemType}`);
    }

    const manualPromote = dto.manualPromote === true;

    return this.prisma.promptImprovement.create({
      data: {
        problemType,
        rootCause: compressText(dto.rootCause, ROOT_CAUSE_MAX),
        promptImprovement: compressText(
          dto.promptImprovement,
          PROMPT_IMPROVEMENT_MAX,
        ),
        confidence: dto.confidence,
        sourcePredictionId: dto.sourcePredictionId,
        status: manualPromote
          ? PromptImprovementStatus.ACTIVE
          : PromptImprovementStatus.CANDIDATE,
        manualPromote,
        isDeprecated: false,
        lastSeenAt: new Date(),
      },
    });
  }

  private toDashboardItem(
    r: PromptImprovement,
  ): PromptImprovementDashboardItem {
    return {
      id: r.id,
      problemType: r.problemType,
      status: r.status,
      occurrences: r.occurrences,
      confidence: r.confidence,
      successRate: r.successRate,
      promptImprovementPreview: truncatePromptPreview(r.promptImprovement),
      rootCause: r.rootCause,
      promptImprovement: r.promptImprovement,
      sourcePredictionId: r.sourcePredictionId,
      createdAt: r.createdAt,
      lastSeenAt: r.lastSeenAt,
    };
  }

  private async maybeDeprecateByQuality(
    id: string,
    stats: { timesApplied: number; successRate: number | null },
  ): Promise<void> {
    if (stats.timesApplied < PROMPT_IMPROVEMENT_DEPRECATION_MIN_APPLICATIONS)
      return;
    if (stats.successRate == null) return;
    if (stats.successRate >= PROMPT_IMPROVEMENT_DEPRECATION_MAX_SUCCESS_RATE)
      return;

    await this.prisma.promptImprovement.update({
      where: { id },
      data: {
        status: PromptImprovementStatus.DEPRECATED,
        isDeprecated: true,
        isActive: false,
      },
    });
    this.logger.warn(
      `Prompt improvement DEPRECATED (successRate=${stats.successRate}): ${id}`,
    );
  }

  private isAllowedProblemType(
    value: string,
  ): value is PromptImprovementProblemType {
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
}
