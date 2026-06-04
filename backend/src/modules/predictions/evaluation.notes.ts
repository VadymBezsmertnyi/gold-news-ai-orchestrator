/**
 * Delayed prediction evaluation is handled locally for now:
 * - POST /predictions/evaluate-due (batch due PENDING predictions)
 * - POST /predictions/:id/evaluate-mock (single prediction, any time)
 *
 * Later: add BullMQ + Redis worker that calls PredictionsService.evaluatePrediction()
 * when checkAfter is reached, instead of polling evaluate-due manually.
 */

export const EVALUATION_APPROACH = 'local-manual' as const;
