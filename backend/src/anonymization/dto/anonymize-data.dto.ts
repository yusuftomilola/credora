import { IsString, IsNotEmpty, IsArray, IsNumber } from 'class-validator';

export class AnonymizeDataDto {
  @IsString()
  @IsNotEmpty()
  readonly data: string;
}

export class ReversibilityDto {
  @IsString()
  @IsNotEmpty()
  readonly pseudonym: string;
}

export class KAnonymityDto {
  @IsArray()
  @IsNotEmpty()
  readonly data: any[];
}

export class DifferentialPrivacyDto {
  @IsNumber()
  @IsNotEmpty()
  readonly value: number;
}