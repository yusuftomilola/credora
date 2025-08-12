import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionsService } from './transaction.service';
import { Transaction } from './entities/transaction.entity';
import { BankAccount } from 'src/banking/entities/bank-account.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, BankAccount])],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
