import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from "typeorm"

export enum RuleType {
  CATEGORIZATION = "categorization",
  FRAUD_DETECTION = "fraud_detection",
  RISK_ASSESSMENT = "risk_assessment",
  SPENDING_LIMIT = "spending_limit",
  PATTERN_DETECTION = "pattern_detection",
}

export enum RuleStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  TESTING = "testing",
}

@Entity("analysis_rules")
@Index(["ruleType", "status"])
export class AnalysisRule {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column({ unique: true })
  name: string

  @Column({ type: "text", nullable: true })
  description: string

  @Column({ type: "enum", enum: RuleType, name: "rule_type" })
  ruleType: RuleType

  @Column({ type: "enum", enum: RuleStatus, default: RuleStatus.ACTIVE })
  status: RuleStatus

  @Column({ type: "jsonb" })
  conditions: Record<string, any> // Rule conditions in JSON format

  @Column({ type: "jsonb" })
  actions: Record<string, any> // Actions to take when rule matches

  @Column({ type: "integer", default: 0 })
  priority: number // Rule execution priority

  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true })
  threshold: number // Threshold for rule activation

  @Column({ name: "version", default: "1.0.0" })
  version: string

  @Column({ name: "created_by" })
  createdBy: string

  @Column({ name: "updated_by", nullable: true })
  updatedBy: string

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date
}
