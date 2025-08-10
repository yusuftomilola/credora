import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CreditBureauController } from './credit-bureau.controller';
import { CreditBureauService } from './credit-bureau.service';

@Module({
  imports: [ConfigModule],
  controllers: [CreditBureauController],
  providers: [CreditBureauService],
  exports: [CreditBureauService],
})
export class CreditBureauModule {}
