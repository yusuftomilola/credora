import { Controller, Get, Post, Body, Param, Delete, Query } from '@nestjs/common';
import { PrivacyService } from './privacy.service';
import { CreateConsentDto } from './dto/create-consent.dto';
import { RequestDataExportDto } from './dto/request-data-export.dto';
import { RequestDataDeletionDto } from './dto/request-data-deletion.dto';
import { CreatePrivacyAssessmentDto } from './dto/create-privacy-assessment.dto';

@Controller('privacy')
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  // Data subject rights
  @Get('access/:userId')
  getUserData(@Param('userId') userId: string) {
    return this.privacyService.getUserData(userId);
  }

  @Post('deletion')
  requestDataDeletion(@Body() dto: RequestDataDeletionDto) {
    return this.privacyService.requestDataDeletion(dto);
  }

  @Post('export')
  requestDataExport(@Body() dto: RequestDataExportDto) {
    return this.privacyService.requestDataExport(dto);
  }

  // Consent management
  @Post('consent')
  createConsent(@Body() dto: CreateConsentDto) {
    return this.privacyService.createConsent(dto);
  }

  @Get('consent/:userId')
  getUserConsent(@Param('userId') userId: string) {
    return this.privacyService.getUserConsent(userId);
  }

  // Privacy impact assessment
  @Post('assessment')
  createAssessment(@Body() dto: CreatePrivacyAssessmentDto) {
    return this.privacyService.createAssessment(dto);
  }

  @Get('assessment/:userId')
  getUserAssessments(@Param('userId') userId: string) {
    return this.privacyService.getUserAssessments(userId);
  }
}
