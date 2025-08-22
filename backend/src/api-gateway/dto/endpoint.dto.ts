import { IsString, IsOptional, IsObject, IsNumber, IsBoolean, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateEndpointDto {
  @ApiProperty({ description: 'API endpoint path' })
  @IsString()
  path: string;

  @ApiProperty({ description: 'HTTP method' })
  @IsString()
  method: string;

  @ApiProperty({ description: 'API version', default: 'v1' })
  @IsString()
  version: string;

  @ApiProperty({ description: 'Target URL or service instances' })
  @IsString()
  targetUrl: string;

  @ApiProperty({ description: 'Request/Response transformation rules', required: false })
  @IsOptional()
  @IsObject()
  transformationRules?: Record<string, any>;

  @ApiProperty({ description: 'Rate limiting configuration', required: false })
  @IsOptional()
  @IsObject()
  rateLimitConfig?: Record<string, any>;

  @ApiProperty({ description: 'Circuit breaker configuration', required: false })
  @IsOptional()
  @IsObject()
  circuitBreakerConfig?: Record<string, any>;

  @ApiProperty({ description: 'Custom headers', required: false })
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @ApiProperty({ description: 'Request timeout in milliseconds', required: false, default: 30000 })
  @IsOptional()
  @IsNumber()
  timeout?: number;
}

export class UpdateEndpointDto {
  @ApiProperty({ description: 'API endpoint path', required: false })
  @IsOptional()
  @IsString()
  path?: string;

  @ApiProperty({ description: 'HTTP method', required: false })
  @IsOptional()
  @IsString()
  method?: string;

  @ApiProperty({ description: 'API version', required: false })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiProperty({ description: 'Target URL or service instances', required: false })
  @IsOptional()
  @IsString()
  targetUrl?: string;

  @ApiProperty({ description: 'Active status', required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ description: 'Request/Response transformation rules', required: false })
  @IsOptional()
  @IsObject()
  transformationRules?: Record<string, any>;

  @ApiProperty({ description: 'Rate limiting configuration', required: false })
  @IsOptional()
  @IsObject()
  rateLimitConfig?: Record<string, any>;

  @ApiProperty({ description: 'Circuit breaker configuration', required: false })
  @IsOptional()
  @IsObject()
  circuitBreakerConfig?: Record<string, any>;

  @ApiProperty({ description: 'Custom headers', required: false })
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @ApiProperty({ description: 'Request timeout in milliseconds', required: false })
  @IsOptional()
  @IsNumber()
  timeout?: number;
}
