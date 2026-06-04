import { Injectable } from '@nestjs/common';
import {
  AgentRunStatus,
  type AgentRun,
  type Prisma,
} from '@prisma/client';

// common
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findRuns(limit = 50): Promise<AgentRun[]> {
    return this.prisma.agentRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /** Placeholder for future agent orchestration — records a stub run for observability. */
  async recordPlaceholderRun(
    agentName: string,
    input?: Record<string, unknown>,
  ): Promise<AgentRun> {
    return this.prisma.agentRun.create({
      data: {
        agentName,
        input: (input ?? undefined) as Prisma.InputJsonValue | undefined,
        output: {
          message:
            'Agent orchestration not implemented yet — manual Claude wiring planned.',
        },
        status: AgentRunStatus.SUCCESS,
      },
    });
  }
}
