import { Module } from '@nestjs/common';
import { RiskService } from './risk.service';
import { RiskController } from './risk.controller';

@Module({
  controllers: [RiskController],
  providers: [RiskService],
})
export class RiskModule {}
