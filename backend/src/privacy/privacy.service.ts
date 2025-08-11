import { Injectable, NotFoundException } from '@nestjs/common';
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
import { UsersService } from '../users/users.service';
import { DocumentsService } from '../documents/documents.service';

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
    private usersService: UsersService,
    private documentsService: DocumentsService,
  ) {}

  // Data subject rights
  async getUserData(userId: string) {
    // Aggregate user and document data
    const userProfile = await this.usersService.getProfile(userId);
    const userDocs = await this.documentsService.getUserDocuments(userId);
    // Classify data
    const classifications = await this.dataClassRepo.find({ where: { entityId: userId } });
    return { userId, profile: userProfile, documents: userDocs, classifications };
  }

  // Data discovery & classification
  async discoverAndClassifyUserData(userId: string) {
    const userProfile = await this.usersService.getProfile(userId);
    // Example: classify PII
    await this.dataClassRepo.save({ entityType: 'user', entityId: userId, classification: 'PII' });
    // Classify documents
    const userDocs = await this.documentsService.getUserDocuments(userId);
    for (const doc of userDocs) {
      await this.dataClassRepo.save({ entityType: 'document', entityId: doc.id, classification: 'sensitive' });
    }
    return { status: 'classified', userId };
  }

  // Data retention & deletion
  async requestDataDeletion(dto: RequestDataDeletionDto) {
  // Automated deletion workflow
  await this.usersService.deactivateProfile(dto.userId, { deactivate: true });
    await this.documentsService.deleteUserDocuments(dto.userId);
    await this.auditLogRepo.save({ userId: dto.userId, action: 'deletion', details: { reason: dto.reason } });
    return { status: 'deleted', userId: dto.userId };
  }

  // Data export in standard formats
  async requestDataExport(dto: RequestDataExportDto) {
    const userProfile = await this.usersService.getProfile(dto.userId);
    const userDocs = await this.documentsService.getUserDocuments(dto.userId);
    // Export as JSON or CSV
    if (dto.format === 'json') {
      return { userId: dto.userId, profile: userProfile, documents: userDocs };
    } else {
      // Convert to CSV (simple example)
      const csv = [
        'id,fullName,email,walletAddress',
        `${userProfile.id},${userProfile.fullName},${userProfile.email},${userProfile.walletAddress}`,
      ].join('\n');
      return { userId: dto.userId, csv };
    }
  }

  // Cross-border data transfer controls
  async checkCrossBorderTransfer(entityId: string, targetCountry: string) {
    // Example: check if entity is allowed to transfer
    const classification = await this.dataClassRepo.findOne({ where: { entityId } });
    if (classification && classification.classification === 'restricted') {
      throw new NotFoundException('Cross-border transfer not allowed');
    }
    return { entityId, targetCountry, allowed: true };
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

