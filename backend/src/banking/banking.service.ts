import { Injectable } from '@nestjs/common';
import { CreateBankingDto } from './dto/create-banking.dto';
import { UpdateBankingDto } from './dto/update-banking.dto';

@Injectable()
export class BankingService {
  create(createBankingDto: CreateBankingDto) {
    return 'This action adds a new banking';
  }

  findAll() {
    return `This action returns all banking`;
  }

  findOne(id: number) {
    return `This action returns a #${id} banking`;
  }

  update(id: number, updateBankingDto: UpdateBankingDto) {
    return `This action updates a #${id} banking`;
  }

  remove(id: number) {
    return `This action removes a #${id} banking`;
  }
}
