import { Controller, Get, Post, Body, Query, Delete } from '@nestjs/common';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('search')
  async search(
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('eventType') eventType?: string,
    @Query('resource') resource?: string,
    @Query('resourceId') resourceId?: string,
    @Query('outcome') outcome?: string,
    @Query('requestId') requestId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const logs = await this.auditService.searchLogs({
      userId,
      action,
      eventType,
      resource,
      resourceId,
      outcome,
      requestId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
    return { logs };
  }

  @Post('anchor')
  async anchor(@Body('fromId') fromId?: string) {
    return this.auditService.anchorBatchToIpfs(fromId);
  }

  @Get('verify')
  async verify() {
    return this.auditService.verifyChain();
  }

  @Delete('purge')
  async purge(@Query('before') before?: string) {
    const cutoff = before ? new Date(before) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    return this.auditService.purgeBefore(cutoff);
  }

  @Get('export')
  async exportCsv(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.auditService.exportCsv({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }
}


