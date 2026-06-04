import { Controller, Get, Param, Post } from '@nestjs/common';

// local
import { PredictionsService } from './predictions.service';

@Controller('predictions')
export class PredictionsController {
  constructor(private readonly predictionsService: PredictionsService) {}

  @Get()
  findAll() {
    return this.predictionsService.findAll();
  }

  @Post('mock')
  createMock() {
    return this.predictionsService.createMockPrediction();
  }

  @Post('evaluate-due')
  evaluateDue() {
    return this.predictionsService.evaluateDuePredictions();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.predictionsService.findById(id);
  }

  @Post(':id/evaluate-mock')
  evaluateMock(@Param('id') id: string) {
    return this.predictionsService.evaluateMock(id);
  }
}
