import { IsString, IsOptional, IsArray, IsNumber, IsDateString, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateApiKeyDto {
  @ApiProperty({ description: 'API key name', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'API key permissions', required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @ApiProperty({ description: 'Rate limit per period', required: false, default: 1000 })
  @IsOptional()
  @IsNumber()
  rateLimit?: number;

  @ApiProperty({ description: 'Rate limit period', required: false, default: 'hour' })
  @IsOptional()
  @IsString()
  rateLimitPeriod?: string;

  @ApiProperty({ description: 'API key expiration date', required: false })
  @IsOptional()
  @IsDateString()
  expiresAt?: Date;
}

export class UpdateApiKeyDto {
  @ApiProperty({ description: 'API key name', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'API key permissions', required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @ApiProperty({ description: 'Rate limit per period', required: false })
  @IsOptional()
  @IsNumber()
  rateLimit?: number;

  @ApiProperty({ description: 'Rate limit period', required: false })
  @IsOptional()
  @IsString()
  rateLimitPeriod?: string;

  @ApiProperty({ description: 'API key active status', required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ description: 'API key expiration date', required: false })
  @IsOptional()
  @IsDateString()
  expiresAt?: Date;
}

