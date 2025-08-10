import { IsString, IsOptional } from 'class-validator';

export class DocumentUploadDto {
  @IsString()
  @IsOptional()
  description?: string;
}
