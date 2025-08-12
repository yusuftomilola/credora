import { BaseCreditBureauAdapter, NormalizedCreditReport } from './credit-bureau.adapter';
// Import axios using require syntax to avoid TypeScript issues
const axios = require('axios');
import { Logger } from '@nestjs/common';

/**
 * Adapter for Experian credit bureau API
 * Documentation: https://developer.experian.com/
 */
export class ExperianAdapter extends BaseCreditBureauAdapter {
  private readonly logger = new Logger(ExperianAdapter.name);
  
  constructor(axiosInstance: any) {
    super(axiosInstance);
  }

  /**
   * Gets credit report from Experian API
   * @param userId User ID in our system
   * @param extra Additional parameters like SSN, DOB, etc.
   */
  async getCreditReport(userId: string, extra?: any): Promise<NormalizedCreditReport> {
    this.logger.log(`Fetching Experian credit report for user ${userId}`);
    
    try {
      // Use retry mechanism for resilience
      const response = await this.withRetry(async () => {
        return this.axios.post('/v1/credit-profile', {
          consumerIdentity: {
            name: {
              firstName: extra?.firstName || '',
              lastName: extra?.lastName || '',
            },
            ssn: extra?.ssn || '',
            dateOfBirth: extra?.dob || '',
            addresses: extra?.addresses || [],
          },
          permissiblePurpose: {
            type: 'account_review',
            terms: extra?.terms || '',
          },
          outputType: 'json',
        });
      });
      
      this.logger.debug(`Received Experian response for user ${userId}`);
      
      // Transform Experian-specific format to our normalized format
      return this.normalizeExperianData(response.data, userId);
    } catch (error) {
      this.logger.error(`Error fetching Experian credit report: ${error.message}`, error.stack);
      throw new Error(`Failed to retrieve Experian credit report: ${error.message}`);
    }
  }

  /**
   * Handles webhook notifications from Experian
   */
  async handleWebhook(payload: any): Promise<void> {
    this.logger.log('Processing Experian webhook');
    
    try {
      // Validate webhook signature
      this.validateWebhookSignature(payload);
      
      // Process different event types
      switch(payload.eventType) {
        case 'report.updated':
          await this.handleReportUpdate(payload.data);
          break;
        case 'alert.created':
          await this.handleAlertCreated(payload.data);
          break;
        default:
          this.logger.warn(`Unknown Experian webhook event type: ${payload.eventType}`);
      }
    } catch (error) {
      this.logger.error(`Error processing Experian webhook: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Transforms Experian API response to normalized format
   */
  private normalizeExperianData(data: any, userId: string): NormalizedCreditReport {
    // Extract FICO score
    const score = data.creditScore?.fico8 || 0;
    
    // Map accounts
    const accounts = (data.tradelines || []).map(account => ({
      type: account.accountType,
      balance: account.currentBalance,
      paymentStatus: account.paymentStatus,
      accountNumber: account.accountNumber?.slice(-4).padStart(account.accountNumber?.length, '*'),
    }));
    
    // Map inquiries
    const inquiries = (data.inquiries || []).map(inquiry => ({
      date: new Date(inquiry.inquiryDate),
      type: inquiry.inquiryType,
      requestor: inquiry.subscriberName,
    }));
    
    // Map public records
    const publicRecords = (data.publicRecords || []).map(record => ({
      type: record.type,
      date: new Date(record.filingDate),
      amount: record.amount,
      status: record.status,
    }));
    
    return {
      userId,
      bureauSource: 'experian',
      score,
      scoreRange: {
        min: 300,
        max: 850,
      },
      accounts,
      inquiries,
      publicRecords,
      rawData: data, // Store original data for reference
    };
  }
  
  /**
   * Validates Experian webhook signature
   */
  private validateWebhookSignature(payload: any): void {
    // Implementation would use HMAC verification with shared secret
    // throw new Error('Invalid webhook signature') if invalid
  }
  
  /**
   * Handles report update event from webhook
   */
  private async handleReportUpdate(data: any): Promise<void> {
    // Process report update notification
    // Could trigger notifications or update stored data
  }
  
  /**
   * Handles alert created event from webhook
   */
  private async handleAlertCreated(data: any): Promise<void> {
    // Process alert notification
    // Could trigger notifications or update stored data
  }
}
