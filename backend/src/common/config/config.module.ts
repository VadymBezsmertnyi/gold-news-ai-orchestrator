import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

// local
import { validateEnv } from './env.validation';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      load: [validateEnv],
    }),
  ],
  exports: [NestConfigModule],
})
export class AppConfigModule {}
