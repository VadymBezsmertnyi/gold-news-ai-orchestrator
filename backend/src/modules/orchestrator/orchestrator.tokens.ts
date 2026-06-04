import type { Prediction, PredictionResult } from '@prisma/client';

export const PREDICTION_EVALUATION_HANDLER = Symbol(
  'PREDICTION_EVALUATION_HANDLER',
);

export interface PredictionEvaluationHandler {
  onPredictionEvaluated(
    prediction: Prediction & { result: PredictionResult | null },
    result: PredictionResult,
  ): Promise<void>;
}
