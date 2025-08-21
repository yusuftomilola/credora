import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm"
import { Transaction } from "./transaction.entity"

export enum AnalysisType {
  CATEGORIZATION = "categorization",
  SPENDING_PATTERN = "spending_pattern",
  INCOME_STABILITY = "income_stability",
  CASH_FLOW = "cash_flow",
  DEBT_TO_INCOME = "debt_to_income",
  BEHAVIORAL_SCORING = "behavioral_scoring",
  FRAUD_DETECTION = "fraud_detection",
  RISK_ASSESSMENT = "risk_assessment",
  TREND_ANALYSIS = "trend_analysis",
}

export enum RiskLevel {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

@Entity("transaction_analyses")
@Index(["transactionId", "analysisType"])
@Index(["userId", "analysisType", "createdAt"])
export class TransactionAnalysis {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column({ name: "transaction_id" })
  transactionId: string

  @Column({ name: "user_id" })
  @Index()
  userId: string

  @Column({ type: "enum", enum: AnalysisType, name: "analysis_type" })
  analysisType: AnalysisType

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  confidence: number // ML confidence score (0-1)

  @Column({ type: "enum", enum: RiskLevel, name: "risk_level", nullable: true })
  riskLevel: RiskLevel

  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  score: number // Numerical score for the analysis

  @Column({ type: "jsonb" })
  result: Record<string, any> // Detailed analysis results

  @Column({ type: "jsonb", nullable: true })
  features: Record<string, any> // ML features used

  @Column({ name: "model_version", nullable: true })
  modelVersion: string

  @Column({ name: "rule_version", nullable: true })
  ruleVersion: string

  @Column({ type: "text", nullable: true })
  notes: string

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date

  @ManyToOne(
    () => Transaction,
    (transaction) => transaction.analyses,
  )
  @JoinColumn({ name: "transaction_id" })
  transaction: Transaction
}
