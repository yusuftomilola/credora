import { Controller, Post, Body, Get } from '@nestjs/common';
import { RiskService } from './risk.service';

@Controller('risk')
export class RiskController {
  constructor(private readonly riskService: RiskService) {}

  @Post('score')
  getRiskScore(@Body() data: any) {
    const score = this.riskService.calculateRiskScore(data);
    return { score };
  }

  @Post('fraud')
  detectFraud(@Body() data: any) {
    const fraud = this.riskService.detectFraud(data);
    return { fraud };
  }

  @Post('anomaly')
  detectAnomaly(@Body() data: any) {
    const anomaly = this.riskService.detectAnomaly(data);
    return { anomaly };
  }

  @Post('geo')
  assessGeo(@Body('location') location: string) {
    const risk = this.riskService.assessGeographicRisk(location);
    return { risk };
  }

  @Post('device')
  fingerprintDevice(@Body('deviceInfo') deviceInfo: any) {
    const fingerprint = this.riskService.fingerprintDevice(deviceInfo);
    return { fingerprint };
  }

  @Get('threshold')
  getThreshold() {
    return { threshold: this.riskService.getRiskThreshold() };
  }

  @Post('adjust')
  adjustRisk(@Body() body: { score: number; context: any }) {
    const adjusted = this.riskService.adjustRiskScore(body.score, body.context);
    return { adjusted };
  }

  @Post('explanation')
  getExplanation(@Body() data: any) {
    return { explanation: this.riskService.getRiskExplanation(data) };
  }

  @Get('performance')
  getPerformance() {
    return this.riskService.getModelPerformance();
  }
}
