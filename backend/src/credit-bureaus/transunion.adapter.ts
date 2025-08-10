import { BaseCreditBureauAdapter, NormalizedCreditReport } from './credit-bureau.adapter';
// Import axios using require syntax to avoid TypeScript issues
const axios = require('axios');
import { Logger } from '@nestjs/common';

/**
 * Adapter for TransUnion credit bureau API
 * Documentation: https://developer.transunion.com/
 */
export class TransUnionAdapter extends BaseCreditBureauAdapter {
  private readonly logger = new Logger(TransUnionAdapter.name);
  
  constructor(axiosInstance: any) {
    super(axiosInstance);
  }

  /**
   * Gets credit report from TransUnion API
   * @param userId User ID in our system
   * @param extra Additional parameters like SSN, DOB, etc.
   */
  async getCreditReport(userId: string, extra?: any): Promise<NormalizedCreditReport> {
    this.logger.log(`Fetching TransUnion credit report for user ${userId}`);
    
    try {
      // Use retry mechanism for resilience
      const response = await this.withRetry(async () => {
        return this.axios.post('/api/v1/creditreports', {
          consumer: {
            personName: {
              firstName: extra?.firstName,
              lastName: extra?.lastName,
            },
            socialSecurityNumber: extra?.ssn,
            dateOfBirth: extra?.dob,
            addresses: extra?.addresses || [],
          },
          requestor: {
            subscriberCode: process.env.TRANSUNION_SUBSCRIBER_CODE,
            industryCode: 'M',
            permissiblePurposeType: 'ACCOUNT_REVIEW',
          },
          outputFormat: 'JSON',
          referenceCodes: {
            internalUserId: userId,
          },
        });
      });
      
      this.logger.debug(`Received TransUnion response for user ${userId}`);
      
      // Transform TransUnion-specific format to our normalized format
      return this.normalizeTransUnionData(response.data, userId);
    } catch (error) {
      this.logger.error(`Error fetching TransUnion credit report: ${error.message}`, error.stack);
      throw new Error(`Failed to retrieve TransUnion credit report: ${error.message}`);
    }
  }

  /**
   * Handles webhook notifications from TransUnion
   */
  async handleWebhook(payload: any): Promise<void> {
    this.logger.log('Processing TransUnion webhook');
    
    try {
      // Validate webhook signature
      this.validateWebhookSignature(payload);
      
      // Process different event types
      switch(payload.event) {
        case 'report.updated':
          await this.handleReportUpdate(payload.data);
          break;
        case 'consumer.alert':
          await this.handleConsumerAlert(payload.data);
          break;
        default:
          this.logger.warn(`Unknown TransUnion webhook event: ${payload.event}`);
      }
    } catch (error) {
      this.logger.error(`Error processing TransUnion webhook: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Transforms TransUnion API response to normalized format
   */
  private normalizeTransUnionData(data: any, userId: string): NormalizedCreditReport {
    // TransUnion typically provides score in a specific section
    const score = data.creditScores?.[0]?.score || 0;
    
    // Map accounts (TransUnion calls them "trades")
    const accounts = (data.tradelines || []).map(account => ({
      type: account.accountTypeDescription,
      balance: account.currentBalance,
      paymentStatus: account.payStatus,
      accountNumber: account.accountNumber?.slice(-4).padStart(account.accountNumber?.length, '*'),
    }));
    
    // Map inquiries
    const inquiries = (data.inquiries || []).map(inquiry => ({
      date: new Date(inquiry.inquiryDate),
      type: inquiry.industryCode,
      requestor: inquiry.subscriberName,
    }));
    
    // Map public records
    const publicRecords = (data.publicRecords || []).map(record => ({
      type: record.recordType,
      date: new Date(record.dateFiled),
      amount: record.amount,
      status: record.status,
    }));
    
    return {
      userId,
      bureauSource: 'transunion',
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
   * Validates TransUnion webhook signature
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
   * Handles consumer alert event from webhook
   */
  private async handleConsumerAlert(data: any): Promise<void> {
    // Process alert notification
    // Could trigger notifications or update stored data
  }
}
