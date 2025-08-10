import { Controller, Post, Body, Get, Param, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { CreditBureauService, CreditBureauType } from './credit-bureau.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * DTO for requesting a credit report
 */
export class CreditReportRequestDto {
  userId: string;
  bureauType?: CreditBureauType;
  additionalInfo?: {
    firstName?: string;
    lastName?: string;
    ssn?: string;
    dob?: string;
    addresses?: Array<{
      street: string;
      city: string;
      state: string;
      zipCode: string;
    }>;
  };
}

/**
 * DTO for webhook payloads
 */
export class WebhookPayloadDto {
  signature: string;
  payload: any;
}

@Controller('credit-bureaus')
export class CreditBureauController {
  constructor(private readonly creditBureauService: CreditBureauService) {}

  /**
   * Get credit report from a specific bureau
   */
  @Get('reports/:userId/:bureau')
  @UseGuards(JwtAuthGuard)
  async getCreditReport(
    @Param('userId') userId: string,
    @Param('bureau') bureau: string
  ) {
    try {
      if (!['experian', 'equifax', 'transunion'].includes(bureau)) {
        throw new HttpException(
          'Invalid bureau type. Must be one of: experian, equifax, transunion',
          HttpStatus.BAD_REQUEST
        );
      }

      return await this.creditBureauService.getCreditReport(
        bureau as CreditBureauType, 
        userId
      );
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to retrieve credit report',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get credit reports from all bureaus
   */
  @Get('reports/:userId')
  @UseGuards(JwtAuthGuard)
  async getAllCreditReports(@Param('userId') userId: string) {
    try {
      return await this.creditBureauService.getAllCreditReports(userId);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to retrieve credit reports',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Request a new credit report (explicitly request latest data)
   */
  @Post('reports/request')
  @UseGuards(JwtAuthGuard)
  async requestCreditReport(@Body() requestDto: CreditReportRequestDto) {
    try {
      const { userId, bureauType, additionalInfo } = requestDto;

      if (bureauType) {
        return await this.creditBureauService.getCreditReport(
          bureauType,
          userId,
          additionalInfo
        );
      } else {
        return await this.creditBureauService.getAllCreditReports(userId);
      }
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to request credit report',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Handle webhooks from bureaus
   */
  @Post('webhooks/:bureau')
  async handleWebhook(
    @Param('bureau') bureau: string,
    @Body() webhookData: WebhookPayloadDto
  ) {
    try {
      if (!['experian', 'equifax', 'transunion'].includes(bureau)) {
        throw new HttpException(
          'Invalid bureau type. Must be one of: experian, equifax, transunion',
          HttpStatus.BAD_REQUEST
        );
      }

      await this.creditBureauService.handleWebhook(
        bureau as CreditBureauType,
        webhookData.payload
      );
      
      return { success: true };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to process webhook',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
