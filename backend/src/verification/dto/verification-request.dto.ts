import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class VerificationRequestDto {
  @IsNotEmpty()
  @IsString()
  userId: string;  // The user ID requesting verification
  
  @IsNotEmpty()
  @IsString()
  documentType: string;  // Document type (e.g., passport, ID card)

  @IsNotEmpty()
  @IsString()
  documentImage: string;  // Base64-encoded image of the document (if applicable)
  
  @IsOptional()
  @IsString()
  selfieImage?: string;  // Optional: Base64-encoded image of the selfie (for biometric verification)
}
