import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

// local
import { QUEUE_NAMES } from './queue.constants';
import type { AppEnv } from '../config/env.validation';

/**
 * Registers BullMQ queues for future delayed prediction evaluation.
 * No processors are wired yet — evaluation is mock-only via HTTP for now.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>) => ({
        connection: {
          url:
            config.get('REDIS_URL', { infer: true }) ?? 'redis://localhost:6379',
          maxRetriesPerRequest: null,
          lazyConnect: true,
        },
      }),
    }),
    BullModule.registerQueue({
      name: QUEUE_NAMES.PREDICTION_EVALUATION,
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
