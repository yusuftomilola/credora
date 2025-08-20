import { Test, type TestingModule } from "@nestjs/testing"
import { CategorizationService } from "../categorization.service"
import { mockTransactions } from "../../../test/mocks/transaction.mock"

describe("CategorizationService", () => {
  let service: CategorizationService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CategorizationService],
    }).compile()

    service = module.get<CategorizationService>(CategorizationService)
  })

  describe("categorizeTransaction", () => {
    it("should categorize restaurant transaction correctly", async () => {
      const transaction = mockTransactions.find((t) => t.description.includes("Restaurant"))

      const result = await service.categorizeTransaction(transaction)

      expect(result.category).toBe("FOOD_DINING")
      expect(result.subcategory).toBe("Restaurant")
      expect(result.confidence).toBeGreaterThan(0.8)
    })

    it("should categorize gas station transaction correctly", async () => {
      const transaction = {
        ...mockTransactions[0],
        description: "SHELL GAS STATION",
        merchant: "Shell",
        amount: -45.5,
      }

      const result = await service.categorizeTransaction(transaction)

      expect(result.category).toBe("TRANSPORTATION")
      expect(result.subcategory).toBe("Gas")
      expect(result.confidence).toBeGreaterThan(0.8)
    })

    it("should handle unknown merchants with lower confidence", async () => {
      const transaction = {
        ...mockTransactions[0],
        description: "UNKNOWN MERCHANT XYZ",
        merchant: "Unknown XYZ",
        amount: -25.0,
      }

      const result = await service.categorizeTransaction(transaction)

      expect(result.category).toBeDefined()
      expect(result.confidence).toBeLessThan(0.7)
    })
  })

  describe("categorizeTransactionsBatch", () => {
    it("should categorize multiple transactions efficiently", async () => {
      const transactions = mockTransactions.slice(0, 5)

      const results = await service.categorizeTransactionsBatch(transactions)

      expect(results).toHaveLength(5)
      results.forEach((result) => {
        expect(result.category).toBeDefined()
        expect(result.subcategory).toBeDefined()
        expect(result.confidence).toBeGreaterThan(0)
      })
    })
  })

  describe("trainModel", () => {
    it("should train categorization model with labeled data", async () => {
      const labeledData = mockTransactions.map((t) => ({
        transaction: t,
        category: "FOOD_DINING",
        subcategory: "Restaurant",
      }))

      const result = await service.trainModel(labeledData)

      expect(result.accuracy).toBeGreaterThan(0.8)
      expect(result.modelVersion).toBeDefined()
    })
  })
})
