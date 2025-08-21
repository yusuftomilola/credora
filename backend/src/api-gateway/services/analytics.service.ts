import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { ApiUsage } from '../entities/api-usage.entity';

export interface UsageMetrics {
  totalRequests: number;
  successRate: number;
  averageResponseTime: number;
  errorRate: number;
  topEndpoints: Array<{ endpoint: string; count: number }>;
  statusCodeDistribution: Record<number, number>;
}

export interface TrafficAnalytics {
  requestsOverTime: Array<{ timestamp: Date; count: number }>;
  topApiKeys: Array<{ apiKeyId: string; count: number }>;
  topIpAddresses: Array<{ ipAddress: string; count: number }>;
  trafficByEndpoint: Array<{ endpoint: string; method: string; count: number }>;
}

export interface PerformanceMetrics {
  p50ResponseTime: number;
  p90ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  slowestEndpoints: Array<{ endpoint: string; avgResponseTime: number }>;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(ApiUsage)
    private readonly usageRepository: Repository<ApiUsage>,
  ) {}

  async recordUsage(data: {
    apiKeyId: string;
    endpoint: string;
    method: string;
    statusCode: number;
    responseTime: number;
    requestSize?: number;
    responseSize?: number;
    metadata?: Record<string, any>;
    userAgent: string;
    ipAddress: string;
  }): Promise<void> {
    try {
      const usage = this.usageRepository.create({
        ...data,
        requestSize: data.requestSize || 0,
        responseSize: data.responseSize || 0,
      });

      await this.usageRepository.save(usage);
    } catch (error) {
      this.logger.error('Failed to record usage', error);
    }
  }

  async getUsageMetrics(
    startDate: Date,
    endDate: Date,
    apiKeyId?: string,
  ): Promise<UsageMetrics> {
    const whereCondition: any = {
      timestamp: Between(startDate, endDate),
    };

    if (apiKeyId) {
      whereCondition.apiKeyId = apiKeyId;
    }

    const [totalRequests, usageData] = await Promise.all([
      this.usageRepository.count({ where: whereCondition }),
      this.usageRepository.find({ where: whereCondition }),
    ]);

    const successfulRequests = usageData.filter(u => u.statusCode >= 200 && u.statusCode < 400).length;
    const errorRequests = usageData.filter(u => u.statusCode >= 400).length;

    const totalResponseTime = usageData.reduce((sum, u) => sum + Number(u.responseTime), 0);
    const averageResponseTime = totalRequests > 0 ? totalResponseTime / totalRequests : 0;

    const endpointCounts = new Map<string, number>();
    usageData.forEach(u => {
      const key = `${u.method} ${u.endpoint}`;
      endpointCounts.set(key, (endpointCounts.get(key) || 0) + 1);
    });

    const topEndpoints = Array.from(endpointCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([endpoint, count]) => ({ endpoint, count }));

    const statusCodeDistribution: Record<number, number> = {};
    usageData.forEach(u => {
      statusCodeDistribution[u.statusCode] = (statusCodeDistribution[u.statusCode] || 0) + 1;
    });

    return {
      totalRequests,
      successRate: totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0,
      errorRate: totalRequests > 0 ? (errorRequests / totalRequests) * 100 : 0,
      averageResponseTime,
      topEndpoints,
      statusCodeDistribution,
    };
  }

  async getTrafficAnalytics(
    startDate: Date,
    endDate: Date,
  ): Promise<TrafficAnalytics> {
    const whereCondition = {
      timestamp: Between(startDate, endDate),
    };

    const usageData = await this.usageRepository.find({ where: whereCondition });

    const hourlyRequests = new Map<string, number>();
    usageData.forEach(u => {
      const hour = new Date(u.timestamp);
      hour.setMinutes(0, 0, 0);
      const key = hour.toISOString();
      hourlyRequests.set(key, (hourlyRequests.get(key) || 0) + 1);
    });

    const requestsOverTime = Array.from(hourlyRequests.entries())
      .map(([timestamp, count]) => ({ timestamp: new Date(timestamp), count }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const apiKeyCounts = new Map<string, number>();
    usageData.forEach(u => {
      apiKeyCounts.set(u.apiKeyId, (apiKeyCounts.get(u.apiKeyId) || 0) + 1);
    });

    const topApiKeys = Array.from(apiKeyCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([apiKeyId, count]) => ({ apiKeyId, count }));

    const ipCounts = new Map<string, number>();
    usageData.forEach(u => {
      ipCounts.set(u.ipAddress, (ipCounts.get(u.ipAddress) || 0) + 1);
    });

    const topIpAddresses = Array.from(ipCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ipAddress, count]) => ({ ipAddress, count }));

    // Traffic by endpoint
    const endpointTraffic = new Map<string, number>();
    usageData.forEach(u => {
      const key = `${u.method}:${u.endpoint}`;
      endpointTraffic.set(key, (endpointTraffic.get(key) || 0) + 1);
    });

    const trafficByEndpoint = Array.from(endpointTraffic.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => {
        const [method, endpoint] = key.split(':');
        return { endpoint, method, count };
      });

    return {
      requestsOverTime,
      topApiKeys,
      topIpAddresses,
      trafficByEndpoint,
    };
  }

  async getPerformanceMetrics(
    startDate: Date,
    endDate: Date,
  ): Promise<PerformanceMetrics> {
    const whereCondition = {
      timestamp: Between(startDate, endDate),
    };

    const usageData = await this.usageRepository.find({ where: whereCondition });
    const responseTimes = usageData.map(u => Number(u.responseTime)).sort((a, b) => a - b);

    const calculatePercentile = (arr: number[], percentile: number): number => {
      if (arr.length === 0) return 0;
      const index = Math.ceil((percentile / 100) * arr.length) - 1;
      return arr[index] || 0;
    };

    const p50ResponseTime = calculatePercentile(responseTimes, 50);
    const p90ResponseTime = calculatePercentile(responseTimes, 90);
    const p95ResponseTime = calculatePercentile(responseTimes, 95);
    const p99ResponseTime = calculatePercentile(responseTimes, 99);

    // Slowest endpoints
    const endpointResponseTimes = new Map<string, number[]>();
    usageData.forEach(u => {
      const key = `${u.method} ${u.endpoint}`;
      if (!endpointResponseTimes.has(key)) {
        endpointResponseTimes.set(key, []);
      }
      endpointResponseTimes.get(key)!.push(Number(u.responseTime));
    });

    const slowestEndpoints = Array.from(endpointResponseTimes.entries())
      .map(([endpoint, times]) => ({
        endpoint,
        avgResponseTime: times.reduce((sum, time) => sum + time, 0) / times.length,
      }))
      .sort((a, b) => b.avgResponseTime - a.avgResponseTime)
      .slice(0, 10);

    return {
      p50ResponseTime,
      p90ResponseTime,
      p95ResponseTime,
      p99ResponseTime,
      slowestEndpoints,
    };
  }

  async cleanupOldUsageData(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.usageRepository.delete({
      timestamp: Between(new Date('1970-01-01'), cutoffDate),
    });

    this.logger.log(`Cleaned up ${result.affected || 0} old usage records`);
    return result.affected || 0;
  }
}