import { Test, TestingModule } from '@nestjs/testing';
import { CreditBureauService } from '../credit-bureau.service';
import { ConfigModule } from '@nestjs/config';
// Import axios using require syntax to avoid TypeScript issues
const axios = require('axios');
import { ExperianAdapter } from '../experian.adapter';
import { EquifaxAdapter } from '../equifax.adapter';
import { TransUnionAdapter } from '../transunion.adapter';
import { CreditBureauFactory } from './credit-bureau.factory';

// Mock the axios module
jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('CreditBureauService', () => {
  let service: CreditBureauService;

  beforeEach(async () => {
    // Mock the axios.create method
    mockAxios.create.mockReturnValue({
      interceptors: {
        request: {
          use: jest.fn(),
          handlers: [{ id: 0, fulfilled: jest.fn(), rejected: jest.fn() }],
        },
        response: {
          use: jest.fn(),
          handlers: [{ id: 0, fulfilled: jest.fn(), rejected: jest.fn() }],
        },
      },
    } as any);

    // Mock the adapters
    jest.spyOn(ExperianAdapter.prototype, 'getCreditReport').mockImplementation(
      (userId) => Promise.resolve(CreditBureauFactory.createMockCreditReport(userId, 'experian'))
    );
    
    jest.spyOn(EquifaxAdapter.prototype, 'getCreditReport').mockImplementation(
      (userId) => Promise.resolve(CreditBureauFactory.createMockCreditReport(userId, 'equifax'))
    );
    
    jest.spyOn(TransUnionAdapter.prototype, 'getCreditReport').mockImplementation(
      (userId) => Promise.resolve(CreditBureauFactory.createMockCreditReport(userId, 'transunion'))
    );

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
      ],
      providers: [CreditBureauService],
    }).compile();

    service = module.get<CreditBureauService>(CreditBureauService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCreditReport', () => {
    it('should get credit report from Experian', async () => {
      const userId = 'user123';
      const report = await service.getCreditReport('experian', userId);
      
      expect(report).toBeDefined();
      expect(report.bureauSource).toBe('experian');
      expect(report.userId).toBe(userId);
    });

    it('should get credit report from Equifax', async () => {
      const userId = 'user123';
      const report = await service.getCreditReport('equifax', userId);
      
      expect(report).toBeDefined();
      expect(report.bureauSource).toBe('equifax');
      expect(report.userId).toBe(userId);
    });

    it('should get credit report from TransUnion', async () => {
      const userId = 'user123';
      const report = await service.getCreditReport('transunion', userId);
      
      expect(report).toBeDefined();
      expect(report.bureauSource).toBe('transunion');
      expect(report.userId).toBe(userId);
    });
  });

  describe('getAllCreditReports', () => {
    it('should get credit reports from all bureaus', async () => {
      const userId = 'user123';
      const reports = await service.getAllCreditReports(userId);
      
      expect(reports).toBeDefined();
      expect(reports.experian).toBeDefined();
      expect(reports.equifax).toBeDefined();
      expect(reports.transunion).toBeDefined();
      
      expect(reports.experian.bureauSource).toBe('experian');
      expect(reports.equifax.bureauSource).toBe('equifax');
      expect(reports.transunion.bureauSource).toBe('transunion');
    });
  });
});
