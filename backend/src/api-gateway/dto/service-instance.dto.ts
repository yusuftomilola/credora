import { IsString, IsOptional, IsNumber, IsBoolean, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateServiceInstanceDto {
  @ApiProperty({ description: 'Service instance ID' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Service instance URL' })
  @IsUrl()
  url: string;

  @ApiProperty({ description: 'Load balancing weight', required: false, default: 1 })
  @IsOptional()
  @IsNumber()
  weight?: number;

  @ApiProperty({ description: 'Health status', required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isHealthy?: boolean;
}