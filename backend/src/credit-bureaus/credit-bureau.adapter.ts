// Import axios using require syntax to avoid TypeScript issues
const axios = require('axios');

/**
 * Normalized structure for credit reports from different bureaus
 */
export interface NormalizedCreditReport {
  userId: string;
  bureauSource: string;
  score: number;
  scoreRange: {
    min: number;
    max: number;
  };
  accounts: Array<{
    type: string;
    balance: number;
    paymentStatus: string;
    accountNumber: string;
  }>;
  inquiries: Array<{
    date: Date;
    type: string;
    requestor: string;
  }>;
  publicRecords: Array<{
    type: string;
    date: Date;
    amount?: number;
    status: string;
  }>;
  rawData?: any; // Original data (may be stored encrypted)
}

/**
 * Interface that all credit bureau adapters must implement
 */
export interface CreditBureauAdapter {
  getCreditReport(userId: string, extra?: any): Promise<NormalizedCreditReport>;
  handleWebhook(payload: any): Promise<void>;
}

/**
 * Base class for credit bureau adapters with common functionality
 */
export abstract class BaseCreditBureauAdapter implements CreditBureauAdapter {
  protected axios: any; // Axios instance
  protected maxRetries = 3;
  
  constructor(axios: any) {
    this.axios = axios;
  }
  
  abstract getCreditReport(userId: string, extra?: any): Promise<NormalizedCreditReport>;
  abstract handleWebhook(payload: any): Promise<void>;
  
  /**
   * Helper method to normalize bureau-specific fields to common format
   */
  protected normalizeData(rawData: any): Partial<NormalizedCreditReport> {
    // This is a base implementation that specific adapters can extend
    return {
      rawData
    };
  }
  
  /**
   * Helper method for retrying failed API calls
   */
  protected async withRetry<T>(
    operation: () => Promise<T>, 
    retries = this.maxRetries
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (retries <= 0) {
        throw error;
      }
      
      // Exponential backoff: 2^retryAttempt * 100ms
      const delay = Math.pow(2, this.maxRetries - retries) * 100;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return this.withRetry(operation, retries - 1);
    }
  }
}
