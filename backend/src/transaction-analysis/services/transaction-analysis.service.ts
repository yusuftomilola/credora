import { Injectable, Logger } from "@nestjs/common"
import type { Repository } from "typeorm"
import { type Transaction, type TransactionAnalysis, type UserFinancialProfile, AnalysisType } from "../entities"
import type { CategorizationService } from "./categorization.service"
import type { SpendingPatternService } from "./spending-pattern.service"
import type { IncomeStabilityService } from "./income-stability.service"
import type { CashFlowService } from "./cash-flow.service"
import type { BehavioralScoringService } from "./behavioral-scoring.service"
import type { FraudDetectionService } from "./fraud-detection.service"
import type { RiskAssessmentService } from "./risk-assessment.service"
import type { TrendAnalysisService } from "./trend-analysis.service"

export interface AnalysisOptions {
  analysisTypes?: AnalysisType[]
  forceReanalysis?: boolean
  includeHistorical?: boolean
  timeRangeMonths?: number
}

export interface AnalysisResult {
  transactionId: string
  userId: string
  analyses: TransactionAnalysis[]
  profileUpdated: boolean
  insights: string[]
  recommendations: string[]
}

@Injectable()
export class TransactionAnalysisService {
  private readonly logger = new Logger(TransactionAnalysisService.name)

  constructor(
    private transactionRepository: Repository<Transaction>,
    private analysisRepository: Repository<TransactionAnalysis>,
    private profileRepository: Repository<UserFinancialProfile>,
    private categorizationService: CategorizationService,
    private spendingPatternService: SpendingPatternService,
    private incomeStabilityService: IncomeStabilityService,
    private cashFlowService: CashFlowService,
    private behavioralScoringService: BehavioralScoringService,
    private fraudDetectionService: FraudDetectionService,
    private riskAssessmentService: RiskAssessmentService,
    private trendAnalysisService: TrendAnalysisService,
  ) {}

  async analyzeTransaction(transactionId: string, options: AnalysisOptions = {}): Promise<AnalysisResult> {
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId },
      relations: ["analyses"],
    })

    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`)
    }

    this.logger.log(`Starting analysis for transaction ${transactionId}`)

    const analysisTypes = options.analysisTypes || Object.values(AnalysisType)
    const analyses: TransactionAnalysis[] = []
    const insights: string[] = []
    const recommendations: string[] = []

    // Get user's historical transactions for context
    const historicalTransactions = await this.getUserTransactions(transaction.userId, options.timeRangeMonths || 12)

    // Run each analysis type
    for (const analysisType of analysisTypes) {
      try {
        const existingAnalysis = transaction.analyses?.find((a) => a.analysisType === analysisType)

        if (existingAnalysis && !options.forceReanalysis) {
          analyses.push(existingAnalysis)
          continue
        }

        const analysisResult = await this.runAnalysis(analysisType, transaction, historicalTransactions)

        if (analysisResult) {
          const analysis = await this.saveAnalysis(analysisResult)
          analyses.push(analysis)

          if (analysisResult.insights) {
            insights.push(...analysisResult.insights)
          }
          if (analysisResult.recommendations) {
            recommendations.push(...analysisResult.recommendations)
          }
        }
      } catch (error) {
        this.logger.error(`Error running ${analysisType} analysis for transaction ${transactionId}:`, error)
      }
    }

    // Update user financial profile
    const profileUpdated = await this.updateUserProfile(transaction.userId, analyses, historicalTransactions)

    this.logger.log(`Completed analysis for transaction ${transactionId}`)

    return {
      transactionId,
      userId: transaction.userId,
      analyses,
      profileUpdated,
      insights: [...new Set(insights)], // Remove duplicates
      recommendations: [...new Set(recommendations)],
    }
  }

  async analyzeBulkTransactions(userId: string, options: AnalysisOptions = {}): Promise<AnalysisResult[]> {
    const transactions = await this.getUserTransactions(userId, options.timeRangeMonths || 3)

    const results: AnalysisResult[] = []

    for (const transaction of transactions) {
      try {
        const result = await this.analyzeTransaction(transaction.id, options)
        results.push(result)
      } catch (error) {
        this.logger.error(`Error analyzing transaction ${transaction.id}:`, error)
      }
    }

    return results
  }

  private async runAnalysis(
    analysisType: AnalysisType,
    transaction: Transaction,
    historicalTransactions: Transaction[],
  ): Promise<any> {
    switch (analysisType) {
      case AnalysisType.CATEGORIZATION:
        return this.categorizationService.categorizeTransaction(transaction, historicalTransactions)

      case AnalysisType.SPENDING_PATTERN:
        return this.spendingPatternService.analyzeSpendingPattern(transaction, historicalTransactions)

      case AnalysisType.INCOME_STABILITY:
        return this.incomeStabilityService.assessIncomeStability(transaction, historicalTransactions)

      case AnalysisType.CASH_FLOW:
        return this.cashFlowService.analyzeCashFlow(transaction, historicalTransactions)

      case AnalysisType.BEHAVIORAL_SCORING:
        return this.behavioralScoringService.calculateBehavioralScore(transaction, historicalTransactions)

      case AnalysisType.FRAUD_DETECTION:
        return this.fraudDetectionService.detectFraud(transaction, historicalTransactions)

      case AnalysisType.RISK_ASSESSMENT:
        return this.riskAssessmentService.assessRisk(transaction, historicalTransactions)

      case AnalysisType.TREND_ANALYSIS:
        return this.trendAnalysisService.analyzeTrends(transaction, historicalTransactions)

      default:
        throw new Error(`Unknown analysis type: ${analysisType}`)
    }
  }

  private async saveAnalysis(analysisResult: any): Promise<TransactionAnalysis> {
    const analysis = this.analysisRepository.create({
      transactionId: analysisResult.transactionId,
      userId: analysisResult.userId,
      analysisType: analysisResult.analysisType,
      confidence: analysisResult.confidence,
      riskLevel: analysisResult.riskLevel,
      score: analysisResult.score,
      result: analysisResult.result,
      features: analysisResult.features,
      modelVersion: analysisResult.modelVersion,
      ruleVersion: analysisResult.ruleVersion,
      notes: analysisResult.notes,
    })

    return this.analysisRepository.save(analysis)
  }

  private async getUserTransactions(userId: string, months: number): Promise<Transaction[]> {
    const startDate = new Date()
    startDate.setMonth(startDate.getMonth() - months)

    return this.transactionRepository.find({
      where: {
        userId,
        transactionDate: {
          $gte: startDate,
        } as any,
      },
      order: {
        transactionDate: "DESC",
      },
    })
  }

  private async updateUserProfile(
    userId: string,
    analyses: TransactionAnalysis[],
    historicalTransactions: Transaction[],
  ): Promise<boolean> {
    try {
      let profile = await this.profileRepository.findOne({
        where: { userId },
      })

      if (!profile) {
        profile = this.profileRepository.create({ userId })
      }

      // Update profile based on analyses
      const behavioralAnalysis = analyses.find((a) => a.analysisType === AnalysisType.BEHAVIORAL_SCORING)
      if (behavioralAnalysis) {
        profile.behavioralScore = behavioralAnalysis.score
      }

      const riskAnalysis = analyses.find((a) => a.analysisType === AnalysisType.RISK_ASSESSMENT)
      if (riskAnalysis) {
        profile.riskScore = riskAnalysis.score
      }

      const fraudAnalysis = analyses.find((a) => a.analysisType === AnalysisType.FRAUD_DETECTION)
      if (fraudAnalysis) {
        profile.fraudScore = fraudAnalysis.score
      }

      // Calculate aggregated metrics
      await this.calculateAggregatedMetrics(profile, historicalTransactions)

      profile.lastAnalysisDate = new Date()
      await this.profileRepository.save(profile)

      return true
    } catch (error) {
      this.logger.error(`Error updating user profile for ${userId}:`, error)
      return false
    }
  }

  private async calculateAggregatedMetrics(profile: UserFinancialProfile, transactions: Transaction[]): Promise<void> {
    const now = new Date()
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const lastMonthTransactions = transactions.filter(
      (t) => t.transactionDate >= lastMonth && t.transactionDate < currentMonth,
    )

    // Calculate monthly income and expenses
    const income = lastMonthTransactions
      .filter((t) => t.type === "credit")
      .reduce((sum, t) => sum + Number(t.amount), 0)

    const expenses = lastMonthTransactions
      .filter((t) => t.type === "debit")
      .reduce((sum, t) => sum + Number(t.amount), 0)

    profile.monthlyIncome = income
    profile.monthlyExpenses = expenses

    // Calculate debt-to-income ratio (simplified)
    if (income > 0) {
      profile.debtToIncomeRatio = expenses / income
    }

    // Categorize spending
    const categories = {}
    lastMonthTransactions
      .filter((t) => t.type === "debit" && t.category)
      .forEach((t) => {
        categories[t.category] = (categories[t.category] || 0) + Number(t.amount)
      })

    profile.categories = categories
  }
}
