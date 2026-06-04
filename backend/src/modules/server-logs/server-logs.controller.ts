import { Controller, Get } from '@nestjs/common';

// local
import { ServerLogsService } from './server-logs.service';

@Controller('server-logs')
export class ServerLogsController {
  constructor(private readonly serverLogsService: ServerLogsService) {}

  @Get()
  findLatest() {
    return this.serverLogsService.findLatest(100);
  }
}
