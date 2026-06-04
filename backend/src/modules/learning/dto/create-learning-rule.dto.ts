export class CreateLearningRuleDto {
  problemType!: string;
  rootCause!: string;
  promptImprovement!: string;
  confidence?: number;
  sourcePredictionId?: string;
  isActive?: boolean;
}
