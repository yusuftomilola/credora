import { Controller, Post, Body, Get } from '@nestjs/common';
import { RiskService } from './risk.service';

@Controller('risk')
export class RiskController {
  constructor(private readonly riskService: RiskService) {}

  @Post('score')
  getRiskScore(@Body() data: any) {
    const result = this.riskService.calculateRiskScore(data);
    return result;
  }

  @Post('fraud')
  detectFraud(@Body() data: any) {
    return this.riskService.detectFraud(data);
  }

  @Post('anomaly')
  detectAnomaly(@Body() data: any) {
    return this.riskService.detectAnomaly(data);
  }

  @Post('geo')
  assessGeo(@Body('location') location: string) {
    return this.riskService.assessGeographicRisk(location);
  }

  @Post('device')
  fingerprintDevice(@Body('deviceInfo') deviceInfo: any) {
    return this.riskService.fingerprintDevice(deviceInfo);
  }

  @Get('threshold')
  getThreshold() {
    return this.riskService.getRiskThreshold();
  }

  @Post('adjust')
  adjustRisk(@Body() body: { score: number; context: any }) {
    return this.riskService.adjustRiskScore(body.score, body.context);
  }

  @Post('explanation')
  getExplanation(@Body() data: any) {
    return this.riskService.getRiskExplanation(data);
  }

  @Get('performance')
  getPerformance() {
    return this.riskService.getModelPerformance();
  }
}
