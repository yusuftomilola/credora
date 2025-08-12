import { Controller, Post, Body, Headers, Req, Logger } from '@nestjs/common';
import { PlaidService } from './plaid.service';
import { Request } from 'express';

@Controller('plaid')
export class PlaidController {
  private readonly logger = new Logger(PlaidController.name);
  constructor(private plaidService: PlaidService) {}

  @Post('create-link-token')
  async createLinkToken(@Body() body: { userId: string }) {
    return this.plaidService.createLinkToken(body.userId);
  }

  @Post('exchange')
  async exchange(@Body() body: { public_token: string }) {
    return this.plaidService.exchangePublicToken(body.public_token);
  }

  // Webhook endpoint Plaid -> POST /plaid/webhook
  // Make sure to set rawBody parser so we can verify signature. See note below.
  @Post('webhook')
  async webhook(
    @Req() req: Request,
    @Headers('Plaid-Signature') plaidSignature: string,
    @Headers('Plaid-Verification') plaidVerification: string,
  ) {
    // Prefer raw body (req.rawBody) — must be configured in main.ts to preserve raw body
    const raw = (req as any).rawBody || JSON.stringify(req.body);
    const sig = plaidVerification || plaidSignature || '';
    try {
      await this.plaidService.handlePlaidWebhook(raw, sig);
      return { status: 'ok' };
    } catch (err) {
      this.logger.error('webhook handling failed', err);
      return { status: 'error', message: (err as Error).message };
    }
  }
}
