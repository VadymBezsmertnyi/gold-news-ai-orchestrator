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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.predictionsService.findById(id);
  }

  @Post('mock')
  createMock() {
    return this.predictionsService.createMockPrediction();
  }

  @Post(':id/evaluate-mock')
  evaluateMock(@Param('id') id: string) {
    return this.predictionsService.evaluateMock(id);
  }
}
