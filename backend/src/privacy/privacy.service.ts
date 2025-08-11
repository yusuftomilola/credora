import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Consent } from './entities/consent.entity';
import { AuditLog } from './entities/audit-log.entity';
import { DataClassification } from './entities/data-classification.entity';
import { PrivacyAssessment } from './entities/privacy-assessment.entity';
import { CreateConsentDto } from './dto/create-consent.dto';
import { RequestDataExportDto } from './dto/request-data-export.dto';
import { RequestDataDeletionDto } from './dto/request-data-deletion.dto';
import { CreatePrivacyAssessmentDto } from './dto/create-privacy-assessment.dto';

@Injectable()
export class PrivacyService {
  constructor(
    @InjectRepository(Consent)
    private consentRepo: Repository<Consent>,
    @InjectRepository(AuditLog)
    private auditLogRepo: Repository<AuditLog>,
    @InjectRepository(DataClassification)
    private dataClassRepo: Repository<DataClassification>,
    @InjectRepository(PrivacyAssessment)
    private assessmentRepo: Repository<PrivacyAssessment>,
  ) {}

  // Data subject rights
  async getUserData(userId: string) {
    // TODO: Aggregate user data from all modules
    return { userId, data: {} };
  }

  async requestDataDeletion(dto: RequestDataDeletionDto) {
    // TODO: Trigger deletion workflow
    return { status: 'pending', userId: dto.userId };
  }

  async requestDataExport(dto: RequestDataExportDto) {
    // TODO: Export user data in standard format
    return { status: 'pending', userId: dto.userId };
  }

  // Consent management
  async createConsent(dto: CreateConsentDto) {
    const consent = this.consentRepo.create(dto);
    await this.consentRepo.save(consent);
    return consent;
  }

  async getUserConsent(userId: string) {
    return this.consentRepo.find({ where: { userId } });
  }

  // Privacy impact assessment
  async createAssessment(dto: CreatePrivacyAssessmentDto) {
    const assessment = this.assessmentRepo.create(dto);
    await this.assessmentRepo.save(assessment);
    return assessment;
  }

  async getUserAssessments(userId: string) {
    return this.assessmentRepo.find({ where: { userId } });
  }
}
