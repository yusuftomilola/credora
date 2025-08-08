import { Test, TestingModule } from '@nestjs/testing';
import { IpfsService } from './ipfs.service';

describe('IpfsService', () => {
  let service: IpfsService;

  const mockIpfsClient = {
    id: async () => ({ id: 'test-node' }),
    add: async (content: any) => ({ cid: { toString: () => 'testcid' } }),
    pin: {
      add: async () => {},
      ls: async function* () { yield { cid: { toString: () => 'testcid' } }; },
      rm: async () => {},
    },
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: IpfsService,
          useValue: new IpfsService(mockIpfsClient),
        },
      ],
    }).compile();
    service = module.get<IpfsService>(IpfsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should pin and validate a document', async () => {
    const content = 'Hello IPFS!';
    const cid = await service.pinDocument(content);
    expect(cid).toBeDefined();
    if (cid) {
      // Validate CID matches content
      const calculatedCid = await service.calculateContentCid(content);
      expect(cid).toEqual(calculatedCid);
      // Check pin status
      const status = await service.getPinStatus(cid);
      expect(typeof status).toBe('boolean');
    }
  });
});
