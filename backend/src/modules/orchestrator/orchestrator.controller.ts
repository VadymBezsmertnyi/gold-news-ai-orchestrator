import { Body, Controller, Get, Post } from '@nestjs/common';

// local
import {
  GlobalContextTrigger,
  OrchestratorService,
} from './orchestrator.service';

class RunGlobalContextDto {
  trigger?: GlobalContextTrigger;
}

@Controller('orchestrator')
export class OrchestratorController {
  constructor(private readonly orchestratorService: OrchestratorService) {}

  @Get('dashboard')
  getDashboard() {
    return this.orchestratorService.getDashboard();
  }

  @Post('analyze-pending')
  analyzePendingNews() {
    return this.orchestratorService.analyzePendingNews();
  }

  @Post('global-context/run')
  runGlobalContext(@Body() body: RunGlobalContextDto) {
    const trigger = body?.trigger ?? 'MANUAL';
    return this.orchestratorService.runGlobalMarketContextAnalysis(trigger);
  }

  @Get('global-context/latest')
  getLatestGlobalContext() {
    return this.orchestratorService.getLatestGlobalContext();
  }
}
