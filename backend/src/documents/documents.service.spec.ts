
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsService } from './documents.service';
import { DocumentProcessingService } from './document-processing.service';

import { getRepositoryToken } from '@nestjs/typeorm';
import { DocumentProcessing } from './entities/document-processing.entity';
import { getQueueToken } from '@nestjs/bull';

describe('DocumentsService', () => {
  let service: DocumentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        DocumentProcessingService,
        {
          provide: getRepositoryToken(DocumentProcessing),
          useValue: {},
        },
        {
          provide: getQueueToken('document-processing'),
          useValue: { add: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
