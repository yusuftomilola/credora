import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common"
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from "@nestjs/swagger"
import type { RuleEngineService } from "../services/rule-engine.service"
import { type CreateRuleDto, type UpdateRuleDto, type RuleTestDto, AnalysisRule } from "../dto/rule.dto"
import type { Repository } from "typeorm"
import { type Transaction, type RuleType, RuleStatus } from "../entities"

@ApiTags("Rule Management")
@Controller("rules")
export class RuleManagementController {
  private readonly logger = new Logger(RuleManagementController.name)

  constructor(
    private readonly ruleEngineService: RuleEngineService,
    private readonly ruleRepository: Repository<AnalysisRule>,
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  @Post()
  @ApiOperation({ summary: "Create a new analysis rule" })
  @ApiResponse({
    status: 201,
    description: "Rule created successfully",
    type: AnalysisRule,
  })
  @ApiResponse({ status: 400, description: "Invalid rule configuration" })
  async createRule(@Body() createRuleDto: CreateRuleDto): Promise<AnalysisRule> {
    try {
      this.logger.log(`Creating new rule: ${createRuleDto.name}`)

      const rule = await this.ruleEngineService.createRule(createRuleDto)

      this.logger.log(`Successfully created rule ${rule.id}: ${rule.name}`)

      return rule
    } catch (error) {
      this.logger.error(`Error creating rule ${createRuleDto.name}:`, error)

      if (error.message.includes("validation") || error.message.includes("required")) {
        throw new HttpException(error.message, HttpStatus.BAD_REQUEST)
      }

      throw new HttpException("Failed to create rule", HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  @Get()
  @ApiOperation({ summary: "Get all analysis rules" })
  @ApiResponse({
    status: 200,
    description: "Rules retrieved successfully",
    type: [AnalysisRule],
  })
  async getAllRules(
    @Query("ruleType") ruleType?: RuleType,
    @Query("status") status?: RuleStatus,
  ): Promise<AnalysisRule[]> {
    try {
      const whereClause: any = {}

      if (ruleType) {
        whereClause.ruleType = ruleType
      }

      if (status) {
        whereClause.status = status
      }

      const rules = await this.ruleRepository.find({
        where: whereClause,
        order: { priority: "DESC", createdAt: "DESC" },
      })

      return rules
    } catch (error) {
      this.logger.error("Error retrieving rules:", error)
      throw new HttpException("Failed to retrieve rules", HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  @Get(":ruleId")
  @ApiOperation({ summary: "Get a specific rule by ID" })
  @ApiParam({ name: "ruleId", description: "Rule ID" })
  @ApiResponse({
    status: 200,
    description: "Rule retrieved successfully",
    type: AnalysisRule,
  })
  @ApiResponse({ status: 404, description: "Rule not found" })
  async getRule(@Param("ruleId") ruleId: string): Promise<AnalysisRule> {
    try {
      const rule = await this.ruleRepository.findOne({
        where: { id: ruleId },
      })

      if (!rule) {
        throw new HttpException("Rule not found", HttpStatus.NOT_FOUND)
      }

      return rule
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }

      this.logger.error(`Error retrieving rule ${ruleId}:`, error)
      throw new HttpException("Failed to retrieve rule", HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  @Put(":ruleId")
  @ApiOperation({ summary: "Update an existing rule" })
  @ApiParam({ name: "ruleId", description: "Rule ID" })
  @ApiResponse({
    status: 200,
    description: "Rule updated successfully",
    type: AnalysisRule,
  })
  @ApiResponse({ status: 404, description: "Rule not found" })
  async updateRule(@Param("ruleId") ruleId: string, @Body() updateRuleDto: UpdateRuleDto): Promise<AnalysisRule> {
    try {
      this.logger.log(`Updating rule ${ruleId}`)

      const updatedRule = await this.ruleEngineService.updateRule(ruleId, updateRuleDto)

      this.logger.log(`Successfully updated rule ${ruleId}`)

      return updatedRule
    } catch (error) {
      this.logger.error(`Error updating rule ${ruleId}:`, error)

      if (error.message.includes("not found")) {
        throw new HttpException("Rule not found", HttpStatus.NOT_FOUND)
      }

      throw new HttpException("Failed to update rule", HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  @Delete(":ruleId")
  @ApiOperation({ summary: "Delete a rule (mark as inactive)" })
  @ApiParam({ name: "ruleId", description: "Rule ID" })
  @ApiResponse({ status: 200, description: "Rule deleted successfully" })
  @ApiResponse({ status: 404, description: "Rule not found" })
  async deleteRule(@Param("ruleId") ruleId: string): Promise<{ message: string }> {
    try {
      this.logger.log(`Deleting rule ${ruleId}`)

      await this.ruleEngineService.deleteRule(ruleId)

      this.logger.log(`Successfully deleted rule ${ruleId}`)

      return { message: "Rule deleted successfully" }
    } catch (error) {
      this.logger.error(`Error deleting rule ${ruleId}:`, error)

      if (error.message.includes("not found")) {
        throw new HttpException("Rule not found", HttpStatus.NOT_FOUND)
      }

      throw new HttpException("Failed to delete rule", HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  @Post(":ruleId/test")
  @ApiOperation({ summary: "Test a rule against a transaction" })
  @ApiParam({ name: "ruleId", description: "Rule ID" })
  @ApiResponse({
    status: 200,
    description: "Rule test completed successfully",
  })
  @ApiResponse({ status: 404, description: "Rule or transaction not found" })
  async testRule(@Param("ruleId") ruleId: string, @Body() testDto: RuleTestDto): Promise<any> {
    try {
      this.logger.log(`Testing rule ${ruleId} against transaction ${testDto.transactionId}`)

      // Get the transaction
      const transaction = await this.transactionRepository.findOne({
        where: { id: testDto.transactionId },
      })

      if (!transaction) {
        throw new HttpException("Transaction not found", HttpStatus.NOT_FOUND)
      }

      // Get historical transactions if requested
      let historicalTransactions: Transaction[] = []
      if (testDto.includeHistorical) {
        const timeRangeMonths = testDto.timeRangeMonths || 12
        const startDate = new Date()
        startDate.setMonth(startDate.getMonth() - timeRangeMonths)

        historicalTransactions = await this.transactionRepository.find({
          where: {
            userId: transaction.userId,
            transactionDate: {
              $gte: startDate,
            } as any,
          },
          order: {
            transactionDate: "DESC",
          },
        })
      }

      // Test the rule
      const result = await this.ruleEngineService.testRule(ruleId, {
        transaction,
        historicalTransactions,
      })

      this.logger.log(`Rule test completed for rule ${ruleId}`)

      return result
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }

      this.logger.error(`Error testing rule ${ruleId}:`, error)
      throw new HttpException("Rule test failed", HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  @Post(":ruleId/activate")
  @ApiOperation({ summary: "Activate a rule" })
  @ApiParam({ name: "ruleId", description: "Rule ID" })
  @ApiResponse({ status: 200, description: "Rule activated successfully" })
  async activateRule(@Param("ruleId") ruleId: string): Promise<{ message: string }> {
    try {
      await this.ruleEngineService.updateRule(ruleId, { status: RuleStatus.ACTIVE })
      return { message: "Rule activated successfully" }
    } catch (error) {
      this.logger.error(`Error activating rule ${ruleId}:`, error)
      throw new HttpException("Failed to activate rule", HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  @Post(":ruleId/deactivate")
  @ApiOperation({ summary: "Deactivate a rule" })
  @ApiParam({ name: "ruleId", description: "Rule ID" })
  @ApiResponse({ status: 200, description: "Rule deactivated successfully" })
  async deactivateRule(@Param("ruleId") ruleId: string): Promise<{ message: string }> {
    try {
      await this.ruleEngineService.updateRule(ruleId, { status: RuleStatus.INACTIVE })
      return { message: "Rule deactivated successfully" }
    } catch (error) {
      this.logger.error(`Error deactivating rule ${ruleId}:`, error)
      throw new HttpException("Failed to deactivate rule", HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  @Get("examples/templates")
  @ApiOperation({ summary: "Get example rule templates" })
  @ApiResponse({
    status: 200,
    description: "Rule templates retrieved successfully",
  })
  async getRuleTemplates(): Promise<any> {
    // Import example rules from DTO
    const { EXAMPLE_RULES } = await import("../dto/rule.dto")
    return EXAMPLE_RULES
  }
}
