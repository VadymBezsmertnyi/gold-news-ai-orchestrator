import { Global, Module } from '@nestjs/common';

// local
import { ServerLogsController } from './server-logs.controller';
import { ServerLogsService } from './server-logs.service';

@Global()
@Module({
  controllers: [ServerLogsController],
  providers: [ServerLogsService],
  exports: [ServerLogsService],
})
export class ServerLogsModule {}
