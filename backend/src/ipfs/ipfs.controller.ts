import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { IpfsService } from './ipfs.service';
import { IpfsDocumentService } from './ipfs-document.service';

@Controller('ipfs')
export class IpfsController {
  constructor(
    private readonly ipfsService: IpfsService,
    private readonly ipfsDocumentService: IpfsDocumentService,
  ) {}

  @Get('health')
  async healthCheck() {
    return { healthy: await this.ipfsService.healthCheck() };
  }

  @Post('pin')
  async pinDocument(@Body('content') content: string, @Body('filename') filename: string, @Body('owner') owner: string) {
    const cid = await this.ipfsService.pinDocument(content);
    if (cid) {
      await this.ipfsDocumentService.saveMetadata(filename || 'unknown', owner || 'unknown', cid);
    }
    return { cid };
  }

  @Get('status')
  async getPinStatus(@Query('cid') cid: string) {
    const status = await this.ipfsService.getPinStatus(cid);
    return { pinned: status };
  }

  @Post('unpin')
  async unpinDocument(@Body('cid') cid: string) {
    const result = await this.ipfsService.unpinDocument(cid);
    return { success: result };
  }

  @Get('gateway')
  getGatewayUrl(@Query('cid') cid: string) {
    return { url: this.ipfsService.getGatewayUrl(cid) };
  }
}
