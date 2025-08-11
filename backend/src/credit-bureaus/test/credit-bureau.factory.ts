import { NormalizedCreditReport } from '../credit-bureau.adapter';

export class CreditBureauFactory {
  /**
   * Creates a mock credit report for testing purposes
   */
  static createMockCreditReport(userId: string, bureau: string): NormalizedCreditReport {
    return {
      userId,
      bureauSource: bureau,
      score: Math.floor(Math.random() * 300) + 550, // Random score between 550-850
      scoreRange: {
        min: 300,
        max: 850,
      },
      accounts: [
        {
          type: 'Credit Card',
          balance: 1250.75,
          paymentStatus: 'Current',
          accountNumber: '****1234',
        },
        {
          type: 'Mortgage',
          balance: 250000.00,
          paymentStatus: 'Current',
          accountNumber: '****5678',
        },
        {
          type: 'Auto Loan',
          balance: 15000.50,
          paymentStatus: 'Current',
          accountNumber: '****9012',
        },
      ],
      inquiries: [
        {
          date: new Date('2025-05-15'),
          type: 'Credit Card Application',
          requestor: 'Big Bank',
        },
        {
          date: new Date('2025-03-22'),
          type: 'Auto Loan',
          requestor: 'Auto Finance Co.',
        },
      ],
      publicRecords: [
        {
          type: 'Bankruptcy',
          date: new Date('2020-01-10'),
          amount: 25000,
          status: 'Discharged',
        },
      ],
    };
  }
}
