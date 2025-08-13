import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { BankingService } from './banking.service';
import { CreateBankingDto } from './dto/create-banking.dto';
import { UpdateBankingDto } from './dto/update-banking.dto';

@Controller('banking')
export class BankingController {
  constructor(private readonly bankingService: BankingService) {}

  @Post()
  create(@Body() createBankingDto: CreateBankingDto) {
    return this.bankingService.create(createBankingDto);
  }

  @Get()
  findAll() {
    return this.bankingService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.bankingService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateBankingDto: UpdateBankingDto) {
    return this.bankingService.update(+id, updateBankingDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.bankingService.remove(+id);
  }
}
