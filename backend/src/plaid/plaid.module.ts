import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlaidService } from './plaid.service';
import { PlaidController } from './plaid.controller';
import { BankToken } from 'src/banking/entities/bank-token.entity';
import { BankAccount } from 'src/banking/entities/bank-account.entity';
import { BankingModule } from 'src/banking/banking.module';

@Module({
  imports: [TypeOrmModule.forFeature([BankToken, BankAccount]), BankingModule],
  providers: [PlaidService],
  controllers: [PlaidController],
  exports: [PlaidService],
})
export class PlaidModule {}
