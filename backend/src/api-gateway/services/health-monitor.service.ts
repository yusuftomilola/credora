import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LoadBalancerService } from './load-balancer.service';
import { AnalyticsService } from './analytics.service';
import { CircuitBreakerService } from './circuit-breaker.service';

@Injectable()
export class HealthMonitorService implements OnModuleInit {
  private readonly logger = new Logger(HealthMonitorService.name);

  constructor(
    private readonly loadBalancerService: LoadBalancerService,
    private readonly analyticsService: AnalyticsService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {}

  onModuleInit() {
    this.logger.log('Health Monitor Service initialized');
  }

  @Cron('*/30 * * * * *')
  async performHealthChecks() {
    try {
      const circuitBreakers = await this.circuitBreakerService.getAllCircuitBreakers();
      
      for (const [serviceName, status] of Object.entries(circuitBreakers)) {
        if (status.state === 'OPEN') {
          this.logger.warn(`Service ${serviceName} circuit breaker is OPEN`);
        }
      }
    } catch (error) {
      this.logger.error('Health check failed', error);
    }
  }


  @Cron('0 0 * * *')
  async cleanupOldData() {
    try {
      const deletedRecords = await this.analyticsService.cleanupOldUsageData(90);
      this.logger.log(`Cleaned up ${deletedRecords} old usage records`);
    } catch (error) {
      this.logger.error('Data cleanup failed', error);
    }
  }

  
  @Cron('0 1 * * *') 
  async generateDailyReport() {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const metrics = await this.analyticsService.getUsageMetrics(yesterday, today);
      const traffic = await this.analyticsService.getTrafficAnalytics(yesterday, today);
      const performance = await this.analyticsService.getPerformanceMetrics(yesterday, today);

      this.logger.log('Daily Report Generated', {
        date: yesterday.toISOString().split('T')[0],
        totalRequests: metrics.totalRequests,
        successRate: metrics.successRate.toFixed(2) + '%',
        avgResponseTime: performance.p50ResponseTime + 'ms',
        topEndpoints: traffic.trafficByEndpoint.slice(0, 5),
      });

    } catch (error) {
      this.logger.error('Daily report generation failed', error);
    }
  }
}