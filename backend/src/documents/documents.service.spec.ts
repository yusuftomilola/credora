
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsService } from './documents.service';
import { DocumentProcessingService } from './document-processing.service';

import { getRepositoryToken } from '@nestjs/typeorm';
import { DocumentProcessing } from './entities/document-processing.entity';
import { getQueueToken } from '@nestjs/bull';

const mockDocuments = [
  { id: 'doc1', userId: 'user1' },
  { id: 'doc2', userId: 'user1' },
  { id: 'doc3', userId: 'user2' },
];

const mockDocumentRepo = {
  find: jest.fn(({ where }) => mockDocuments.filter(doc => doc.userId === where.userId)),
  delete: jest.fn((id) => Promise.resolve({ affected: 1 })),
};

describe('DocumentsService', () => {
  let service: DocumentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        {
          provide: getRepositoryToken(DocumentProcessing),
          useValue: mockDocumentRepo,
        },
        { provide: getQueueToken('document-processing'), useValue: {} },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
  });

  it('should get all documents for a user', async () => {
    const docs = await service.getUserDocuments('user1');
    expect(docs).toHaveLength(2);
    expect(docs[0].userId).toBe('user1');
  });

  it('should delete all documents for a user', async () => {
    const result = await service.deleteUserDocuments('user1');
    expect(result.status).toBe('deleted');
    expect(result.userId).toBe('user1');
    expect(mockDocumentRepo.delete).toHaveBeenCalledTimes(2);
  });
});
