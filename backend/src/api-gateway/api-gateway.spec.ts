import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ApiGatewayService } from './api-gateway.service';
import { RateLimitService } from './services/rate-limit.service';
import { ApiKeyService } from './services/api-key.service';
import { AnalyticsService } from './services/analytics.service';
import { ApiKey } from './entities/api-key.entity';
import { ApiUsage } from './entities/api-usage.entity';
import { ApiEndpoint } from './entities/api-endpoint.entity';

describe('API Gateway', () => {
  let service: ApiGatewayService;
  let apiKeyService: ApiKeyService;
  let rateLimitService: RateLimitService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiGatewayService,
        ApiKeyService,
        RateLimitService,
        AnalyticsService,
        {
          provide: getRepositoryToken(ApiKey),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ApiUsage),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ApiEndpoint),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: 'REDIS_SERVICE',
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            incr: jest.fn(),
            expire: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ApiGatewayService>(ApiGatewayService);
    apiKeyService = module.get<ApiKeyService>(ApiKeyService);
    rateLimitService = module.get<RateLimitService>(RateLimitService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(apiKeyService).toBeDefined();
    expect(rateLimitService).toBeDefined();
  });

});

