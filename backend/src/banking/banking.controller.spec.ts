import { Test, TestingModule } from '@nestjs/testing';
import { BankingController } from './banking.controller';
import { BankingService } from './banking.service';

describe('BankingController', () => {
  let controller: BankingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BankingController],
      providers: [BankingService],
    }).compile();

    controller = module.get<BankingController>(BankingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
