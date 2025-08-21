import { IsUUID, IsOptional, IsArray, IsEnum, IsBoolean, IsNumber, Min, Max } from "class-validator"
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { AnalysisType } from "../entities"

export class AnalyzeTransactionDto {
  @ApiProperty({ description: "Transaction ID to analyze" })
  @IsUUID()
  transactionId: string

  @ApiPropertyOptional({
    description: "Specific analysis types to run",
    enum: AnalysisType,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(AnalysisType, { each: true })
  analysisTypes?: AnalysisType[]

  @ApiPropertyOptional({ description: "Force re-analysis even if results exist" })
  @IsOptional()
  @IsBoolean()
  forceReanalysis?: boolean

  @ApiPropertyOptional({ description: "Include historical data in analysis" })
  @IsOptional()
  @IsBoolean()
  includeHistorical?: boolean

  @ApiPropertyOptional({
    description: "Time range in months for historical data",
    minimum: 1,
    maximum: 24,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(24)
  timeRangeMonths?: number
}

export class BulkAnalyzeDto {
  @ApiProperty({ description: "User ID for bulk analysis" })
  @IsUUID()
  userId: string

  @ApiPropertyOptional({
    description: "Specific analysis types to run",
    enum: AnalysisType,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(AnalysisType, { each: true })
  analysisTypes?: AnalysisType[]

  @ApiPropertyOptional({
    description: "Time range in months for transactions to analyze",
    minimum: 1,
    maximum: 12,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(12)
  timeRangeMonths?: number

  @ApiPropertyOptional({ description: "Force re-analysis even if results exist" })
  @IsOptional()
  @IsBoolean()
  forceReanalysis?: boolean
}

export class GetAnalysisHistoryDto {
  @ApiProperty({ description: "User ID" })
  @IsUUID()
  userId: string

  @ApiPropertyOptional({
    description: "Filter by analysis type",
    enum: AnalysisType,
  })
  @IsOptional()
  @IsEnum(AnalysisType)
  analysisType?: AnalysisType

  @ApiPropertyOptional({
    description: "Number of results to return",
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number

  @ApiPropertyOptional({
    description: "Number of results to skip",
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  offset?: number
}

export class TransactionAnalysisResponseDto {
  @ApiProperty({ description: "Transaction ID" })
  transactionId: string

  @ApiProperty({ description: "User ID" })
  userId: string

  @ApiProperty({ description: "Analysis results", isArray: true })
  analyses: any[]

  @ApiProperty({ description: "Whether user profile was updated" })
  profileUpdated: boolean

  @ApiProperty({ description: "Generated insights", type: [String] })
  insights: string[]

  @ApiProperty({ description: "Recommendations", type: [String] })
  recommendations: string[]

  @ApiProperty({ description: "Analysis execution time in milliseconds" })
  executionTime?: number
}

export class BulkAnalysisResponseDto {
  @ApiProperty({ description: "User ID" })
  userId: string

  @ApiProperty({ description: "Total transactions analyzed" })
  totalTransactions: number

  @ApiProperty({ description: "Successfully analyzed transactions" })
  successfulAnalyses: number

  @ApiProperty({ description: "Failed analyses" })
  failedAnalyses: number

  @ApiProperty({ description: "Individual analysis results", type: [TransactionAnalysisResponseDto] })
  results: TransactionAnalysisResponseDto[]

  @ApiProperty({ description: "Total execution time in milliseconds" })
  totalExecutionTime: number
}

export class AnalysisStatsDto {
  @ApiProperty({ description: "User ID" })
  userId: string

  @ApiProperty({ description: "Total analyses performed" })
  totalAnalyses: number

  @ApiProperty({ description: "Analyses by type" })
  analysesByType: Record<string, number>

  @ApiProperty({ description: "Average confidence score" })
  averageConfidence: number

  @ApiProperty({ description: "Risk level distribution" })
  riskDistribution: Record<string, number>

  @ApiProperty({ description: "Most recent analysis date" })
  lastAnalysisDate: Date
}
