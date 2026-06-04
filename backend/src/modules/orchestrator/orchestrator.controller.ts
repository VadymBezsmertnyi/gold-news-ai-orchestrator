import { Controller, Get, Post } from '@nestjs/common';

// local
import { OrchestratorService } from './orchestrator.service';

@Controller('orchestrator')
export class OrchestratorController {
  constructor(private readonly orchestratorService: OrchestratorService) {}

  @Get('dashboard')
  getDashboard() {
    return this.orchestratorService.getDashboard();
  }

  @Post('analyze-pending-placeholder')
  analyzePendingPlaceholder() {
    return this.orchestratorService.analyzePendingNewsPlaceholder();
  }

  @Get('global-context-placeholder')
  getGlobalContextPlaceholder() {
    return this.orchestratorService.getGlobalContextPlaceholder();
  }
}
