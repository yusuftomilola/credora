import { BaseCreditBureauAdapter, NormalizedCreditReport } from './credit-bureau.adapter';
// Import axios using require syntax to avoid TypeScript issues
const axios = require('axios');
import { Logger } from '@nestjs/common';

/**
 * Adapter for Equifax credit bureau API
 * Documentation: https://developer.equifax.com/
 */
export class EquifaxAdapter extends BaseCreditBureauAdapter {
  private readonly logger = new Logger(EquifaxAdapter.name);
  
  constructor(axiosInstance: any) {
    super(axiosInstance);
  }

  /**
   * Gets credit report from Equifax API
   * @param userId User ID in our system
   * @param extra Additional parameters like SSN, DOB, etc.
   */
  async getCreditReport(userId: string, extra?: any): Promise<NormalizedCreditReport> {
    this.logger.log(`Fetching Equifax credit report for user ${userId}`);
    
    try {
      // Use retry mechanism for resilience
      const response = await this.withRetry(async () => {
        return this.axios.post('/credit/consumer-credit-report/v1/reports', {
          consumerPii: {
            primaryApplicant: {
              name: {
                firstName: extra?.firstName,
                lastName: extra?.lastName,
              },
              ssn: extra?.ssn,
              dateOfBirth: extra?.dob,
              currentAddress: extra?.currentAddress,
            },
          },
          permissiblePurpose: {
            type: 'account_review',
            industryCode: 'mortgage',
          },
          customerReferenceIdentifier: userId,
        });
      });
      
      this.logger.debug(`Received Equifax response for user ${userId}`);
      
      // Transform Equifax-specific format to our normalized format
      return this.normalizeEquifaxData(response.data, userId);
    } catch (error) {
      this.logger.error(`Error fetching Equifax credit report: ${error.message}`, error.stack);
      throw new Error(`Failed to retrieve Equifax credit report: ${error.message}`);
    }
  }

  /**
   * Handles webhook notifications from Equifax
   */
  async handleWebhook(payload: any): Promise<void> {
    this.logger.log('Processing Equifax webhook');
    
    try {
      // Validate webhook signature
      this.validateWebhookSignature(payload);
      
      // Process different event types
      switch(payload.eventType) {
        case 'creditreport.update':
          await this.handleCreditReportUpdate(payload.data);
          break;
        case 'creditreport.alert':
          await this.handleCreditAlert(payload.data);
          break;
        default:
          this.logger.warn(`Unknown Equifax webhook event type: ${payload.eventType}`);
      }
    } catch (error) {
      this.logger.error(`Error processing Equifax webhook: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Transforms Equifax API response to normalized format
   */
  private normalizeEquifaxData(data: any, userId: string): NormalizedCreditReport {
    // Equifax typically provides score in a different structure
    const score = data.creditScore?.score || 0;
    
    // Map accounts (Equifax calls them "tradelines")
    const accounts = (data.trades || []).map(account => ({
      type: account.accountType,
      balance: account.balance,
      paymentStatus: account.status,
      accountNumber: account.accountIdentifier?.slice(-4).padStart(account.accountIdentifier?.length, '*'),
    }));
    
    // Map inquiries
    const inquiries = (data.inquiries || []).map(inquiry => ({
      date: new Date(inquiry.inquiryDate),
      type: inquiry.inquiryType,
      requestor: inquiry.customerName,
    }));
    
    // Map public records
    const publicRecords = (data.publicRecords || []).map(record => ({
      type: record.recordType,
      date: new Date(record.filingDate),
      amount: record.amount,
      status: record.disposition,
    }));
    
    return {
      userId,
      bureauSource: 'equifax',
      score,
      scoreRange: {
        min: 280,
        max: 850,
      },
      accounts,
      inquiries,
      publicRecords,
      rawData: data, // Store original data for reference
    };
  }
  
  /**
   * Validates Equifax webhook signature
   */
  private validateWebhookSignature(payload: any): void {
    // Implementation would use HMAC verification with shared secret
    // throw new Error('Invalid webhook signature') if invalid
  }
  
  /**
   * Handles credit report update event from webhook
   */
  private async handleCreditReportUpdate(data: any): Promise<void> {
    // Process report update notification
    // Could trigger notifications or update stored data
  }
  
  /**
   * Handles credit alert event from webhook
   */
  private async handleCreditAlert(data: any): Promise<void> {
    // Process alert notification
    // Could trigger notifications or update stored data
  }
}
