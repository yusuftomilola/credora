import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class VerificationResponseDto {
  @IsNotEmpty()
  @IsString()
  verificationStatus: string;  // Status of the verification (e.g., 'verified', 'failed')

  @IsOptional()
  @IsString()
  failureReason?: string;  // Reason for failure, if any

  @IsOptional()
  @IsString()
  verificationProvider?: string;  // Provider used for the verification (e.g., 'Jumio', 'Onfido')

  @IsOptional()
  @IsString()
  verificationId?: string;  // Unique ID assigned to this verification (by provider)

  @IsOptional()
  @IsString()
  additionalInfo?: string;  // Any additional info provided by the provider (e.g., match score, warnings)
}
