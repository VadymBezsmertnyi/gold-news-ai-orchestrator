export class CreateLearningRuleDto {
  title!: string;
  description!: string;
  sourcePredictionId?: string;
  isActive?: boolean;
}
