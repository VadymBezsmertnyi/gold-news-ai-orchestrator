import { Injectable } from '@nestjs/common';
import type { Prisma, ServerLog } from '@prisma/client';

// common
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ServerLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async info(
    type: string,
    message: string,
    meta?: Prisma.InputJsonValue,
  ): Promise<ServerLog> {
    return this.write('info', type, message, meta);
  }

  async warn(
    type: string,
    message: string,
    meta?: Prisma.InputJsonValue,
  ): Promise<ServerLog> {
    return this.write('warn', type, message, meta);
  }

  async error(
    type: string,
    message: string,
    meta?: Prisma.InputJsonValue,
  ): Promise<ServerLog> {
    return this.write('error', type, message, meta);
  }

  async findLatest(limit = 100): Promise<ServerLog[]> {
    return this.prisma.serverLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getLastCompletedAt(type: string): Promise<Date | null> {
    const log = await this.prisma.serverLog.findFirst({
      where: {
        type,
        message: { contains: 'completed' },
      },
      orderBy: { createdAt: 'desc' },
    });
    return log?.createdAt ?? null;
  }

  private write(
    level: string,
    type: string,
    message: string,
    meta?: Prisma.InputJsonValue,
  ): Promise<ServerLog> {
    return this.prisma.serverLog.create({
      data: { type, message, level, meta },
    });
  }
}
