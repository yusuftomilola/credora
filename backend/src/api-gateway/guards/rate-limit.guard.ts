import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitService, RateLimitConfig } from '../services/rate-limit.service';
import { ApiKeyService } from '../services/api-key.service';

export const RATE_LIMIT_KEY = 'rateLimit';
export const RateLimit = (config: RateLimitConfig) =>
  SetMetadata(RATE_LIMIT_KEY, config);

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const rateLimitConfig = this.reflector.get<RateLimitConfig>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    ) || this.getDefaultRateLimitConfig();

    const { key, config } = await this.getRateLimitKeyAndConfig(request, rateLimitConfig);

    try {
      const result = await this.rateLimitService.checkRateLimit(key, config);

      response.header('X-RateLimit-Limit', config.maxRequests.toString());
      response.header('X-RateLimit-Remaining', result.remaining.toString());
      response.header('X-RateLimit-Reset', result.resetTime.toISOString());

      if (!result.allowed) {
        this.logger.warn(`Rate limit exceeded for key: ${key}`);
        throw new HttpException(
          {
            message: 'Rate limit exceeded',
            error: 'Too Many Requests',
            statusCode: 429,
            retryAfter: Math.ceil((result.resetTime.getTime() - Date.now()) / 1000),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error('Rate limit check failed', error);
      return true;
    }
  }

  private async getRateLimitKeyAndConfig(
    request: any,
    defaultConfig: RateLimitConfig,
  ): Promise<{ key: string; config: RateLimitConfig }> {
    const apiKeyHeader = request.headers['x-api-key'];
    if (apiKeyHeader) {
      const apiKey = await this.apiKeyService.validateApiKey(apiKeyHeader);
      if (apiKey) {
        const key = this.rateLimitService.generateApiKeyRateLimitKey(apiKey.key);
        const config = {
          ...defaultConfig,
          maxRequests: apiKey.rateLimit,
          windowMs: this.parsePeriodToMs(apiKey.rateLimitPeriod),
        };
        return { key, config };
      }
    }

    if (request.user && request.user.sub) {
      const key = this.rateLimitService.generateUserRateLimitKey(request.user.sub);
      return { key, config: defaultConfig };
    }

    const ip = this.getClientIp(request);
    const key = this.rateLimitService.generateIPRateLimitKey(ip);
    return { key, config: defaultConfig };
  }

  private getClientIp(request: any): string {
    return (
      request.headers['x-forwarded-for']?.split(',')[0] ||
      request.headers['x-real-ip'] ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      request.ip ||
      'unknown'
    );
  }

  private parsePeriodToMs(period: string): number {
    const periodMap = {
      second: 1000,
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
    };

    return periodMap[period] || periodMap.hour;
  }

  private getDefaultRateLimitConfig(): RateLimitConfig {
    return {
      windowMs: 60 * 60 * 1000, 
      maxRequests: 1000,
    };
  }
}