import { Test, type TestingModule } from "@nestjs/testing"
import { FraudDetectionService } from "../fraud-detection.service"
import { mockTransactions } from "../../../test/mocks/transaction.mock"

describe("FraudDetectionService", () => {
  let service: FraudDetectionService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FraudDetectionService],
    }).compile()

    service = module.get<FraudDetectionService>(FraudDetectionService)
  })

  describe("detectFraud", () => {
    it("should detect low risk for normal transaction", async () => {
      const transaction = mockTransactions[0]

      const result = await service.detectFraud(transaction)

      expect(result.riskScore).toBeLessThan(0.3)
      expect(result.fraudScore).toBeLessThan(0.2)
      expect(result.indicators).toHaveLength(0)
    })

    it("should detect high risk for unusual amount", async () => {
      const transaction = {
        ...mockTransactions[0],
        amount: -5000, // Unusually high amount
      }

      const result = await service.detectFraud(transaction)

      expect(result.riskScore).toBeGreaterThan(0.7)
      expect(result.indicators).toContain("UNUSUAL_AMOUNT")
    })

    it("should detect suspicious location patterns", async () => {
      const transaction = {
        ...mockTransactions[0],
        location: "Unknown Location, Foreign Country",
        metadata: { country: "XX", city: "Unknown" },
      }

      const result = await service.detectFraud(transaction)

      expect(result.indicators).toContain("SUSPICIOUS_LOCATION")
    })

    it("should detect velocity fraud patterns", async () => {
      const transactions = Array(10)
        .fill(null)
        .map((_, i) => ({
          ...mockTransactions[0],
          id: `tx-${i}`,
          timestamp: new Date(Date.now() - i * 60000), // 1 minute apart
          amount: -100,
        }))

      const result = await service.detectVelocityFraud(transactions)

      expect(result.riskScore).toBeGreaterThan(0.8)
      expect(result.indicators).toContain("HIGH_VELOCITY")
    })
  })

  describe("analyzeTransactionPatterns", () => {
    it("should identify normal spending patterns", async () => {
      const transactions = mockTransactions

      const result = await service.analyzeTransactionPatterns(transactions)

      expect(result.patterns).toBeDefined()
      expect(result.anomalies).toBeDefined()
      expect(result.riskFactors).toBeDefined()
    })
  })
})
