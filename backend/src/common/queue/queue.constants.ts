/** BullMQ queue names — workers will be added when delayed evaluation is implemented. */
export const QUEUE_NAMES = {
  PREDICTION_EVALUATION: 'prediction-evaluation',
} as const;

export const QUEUE_JOB_NAMES = {
  EVALUATE_PREDICTION: 'evaluate-prediction',
} as const;
