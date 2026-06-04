import { Controller, Get } from '@nestjs/common';

// local
import { OrchestratorService } from './orchestrator.service';

@Controller('orchestrator')
export class OrchestratorController {
  constructor(private readonly orchestratorService: OrchestratorService) {}

  @Get('dashboard')
  getDashboard() {
    return this.orchestratorService.getDashboard();
  }
}
