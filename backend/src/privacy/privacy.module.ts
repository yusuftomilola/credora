import { Module } from '@nestjs/common';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Consent } from './entities/consent.entity';
import { AuditLog } from './entities/audit-log.entity';
import { DataClassification } from './entities/data-classification.entity';
import { PrivacyAssessment } from './entities/privacy-assessment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Consent, AuditLog, DataClassification, PrivacyAssessment])],
  controllers: [PrivacyController],
  providers: [PrivacyService],
  exports: [PrivacyService],
})
export class PrivacyModule {}
