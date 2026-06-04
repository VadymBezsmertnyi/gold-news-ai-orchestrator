import { Global, Module, forwardRef } from '@nestjs/common';

import { OrchestratorModule } from './orchestrator.module';
import { PredictionEvaluationHooksService } from './prediction-evaluation-hooks.service';
import { PREDICTION_EVALUATION_HANDLER } from './orchestrator.tokens';

@Global()
@Module({
  imports: [forwardRef(() => OrchestratorModule)],
  providers: [
    {
      provide: PREDICTION_EVALUATION_HANDLER,
      useExisting: PredictionEvaluationHooksService,
    },
  ],
  exports: [PREDICTION_EVALUATION_HANDLER],
})
export class OrchestratorIntegrationModule {}
