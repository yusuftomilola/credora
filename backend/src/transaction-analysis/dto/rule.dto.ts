export class CreateRuleDto {
  name: string
  description?: string
  ruleType: string
  conditions: Record<string, any>
  actions: Record<string, any>
  priority?: number
  threshold?: number
  createdBy: string
}

export class UpdateRuleDto {
  name?: string
  description?: string
  conditions?: Record<string, any>
  actions?: Record<string, any>
  priority?: number
  threshold?: number
  status?: string
  updatedBy?: string
}

export class RuleTestDto {
  transactionId: string
  includeHistorical?: boolean
  timeRangeMonths?: number
}

// Example rule configurations
export const EXAMPLE_RULES = {
  // High amount transaction rule
  HIGH_AMOUNT_ALERT: {
    name: "High Amount Transaction Alert",
    description: "Alert for transactions above $5000",
    ruleType: "risk_assessment",
    conditions: {
      type: "comparison",
      field: "transaction.amount",
      operator: "gt",
      value: 5000,
    },
    actions: [
      {
        type: "setRiskLevel",
        riskLevel: "high",
        reason: "High transaction amount",
      },
      {
        type: "sendAlert",
        alertType: "high_amount",
        message: "High amount transaction detected",
        recipients: ["risk_team"],
      },
    ],
    priority: 100,
  },

  // Velocity fraud detection
  VELOCITY_FRAUD: {
    name: "Transaction Velocity Fraud",
    description: "Detect rapid successive transactions",
    ruleType: "fraud_detection",
    conditions: {
      type: "frequency",
      value: {
        threshold: 5,
        timeWindow: 1, // 1 hour
      },
    },
    actions: [
      {
        type: "flagFraud",
        fraudType: "velocity",
        severity: "high",
        reason: "Suspicious transaction velocity",
      },
      {
        type: "requireApproval",
        approvalType: "manual",
        priority: "urgent",
      },
    ],
    priority: 200,
  },

  // Merchant categorization
  GROCERY_CATEGORIZATION: {
    name: "Grocery Store Categorization",
    description: "Auto-categorize grocery store transactions",
    ruleType: "categorization",
    conditions: {
      type: "or",
      conditions: [
        {
          type: "pattern",
          field: "transaction.merchantName",
          value: ".*(grocery|supermarket|walmart|target).*",
        },
        {
          type: "comparison",
          field: "transaction.merchantCategory",
          operator: "eq",
          value: "grocery_stores",
        },
      ],
    },
    actions: [
      {
        type: "categorize",
        category: "Groceries",
        subcategory: "Food & Household",
      },
    ],
    priority: 50,
  },

  // Off-hours transaction monitoring
  OFF_HOURS_MONITORING: {
    name: "Off Hours Transaction Monitoring",
    description: "Monitor transactions during unusual hours",
    ruleType: "fraud_detection",
    conditions: {
      type: "and",
      conditions: [
        {
          type: "time",
          operator: "hourRange",
          value: { start: 2, end: 5 },
        },
        {
          type: "comparison",
          field: "transaction.amount",
          operator: "gt",
          value: 500,
        },
      ],
    },
    actions: [
      {
        type: "addTag",
        tags: ["off_hours", "suspicious_timing"],
      },
      {
        type: "setRiskLevel",
        riskLevel: "medium",
        reason: "Off-hours high-value transaction",
      },
    ],
    priority: 75,
  },

  // Statistical anomaly detection
  AMOUNT_ANOMALY: {
    name: "Transaction Amount Anomaly",
    description: "Detect transactions with unusual amounts",
    ruleType: "risk_assessment",
    conditions: {
      type: "statistical",
      field: "transaction.amount",
      operator: "zScore",
      value: { threshold: 3 },
    },
    actions: [
      {
        type: "setScore",
        scoreType: "anomaly_score",
        score: 0.8,
      },
      {
        type: "addTag",
        tags: ["amount_anomaly"],
      },
    ],
    priority: 60,
  },
}
