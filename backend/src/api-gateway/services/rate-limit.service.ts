import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: any) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  totalHits: number;
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(private readonly redisService: RedisService) {}

  async checkRateLimit(
    key: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult> {
    try {
      const windowStart = Math.floor(Date.now() / config.windowMs);
      const redisKey = `rate_limit:${key}:${windowStart}`;

      this.redisService.incr(redisKey);
      const currentStr = await this.redisService.get(redisKey);
      const current = parseInt(currentStr ?? '0', 10);
      if (current === 1) {
        this.redisService.expire(redisKey, Math.ceil(config.windowMs / 1000));
      }
      const resetTime = new Date((windowStart + 1) * config.windowMs);
      const remaining = Math.max(0, config.maxRequests - current);

      return {
        allowed: current <= config.maxRequests,
        remaining,
        resetTime,
        totalHits: current,
      };
    } catch (error) {
      this.logger.error('Rate limit check failed', error);
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetTime: new Date(Date.now() + config.windowMs),
        totalHits: 0,
      };
    }
  }

  async resetRateLimit(key: string): Promise<void> {
    try {
      const pattern = `rate_limit:${key}:*`;
      const keys = await this.redisService.keys(pattern);

      if (keys && keys.length > 0) {
        await this.redisService.del(keys[0]);
      }
    } catch (error) {
      this.logger.error('Rate limit reset failed', error);
    }
  }

  async getRateLimitStatus(key: string, windowMs: number): Promise<number> {
    try {
      const windowStart = Math.floor(Date.now() / windowMs);
      const redisKey = `rate_limit:${key}:${windowStart}`;

      const current = await this.redisService.get(redisKey);
      return parseInt(current ?? '0', 10);
    } catch (error) {
      this.logger.error('Rate limit status check failed', error);
      return 0;
    }
  }

  generateApiKeyRateLimitKey(apiKey: string): string {
    return `api_key:${apiKey}`;
  }

  generateUserRateLimitKey(userId: string): string {
    return `user:${userId}`;
  }

  generateIPRateLimitKey(ip: string): string {
    return `ip:${ip}`;
  }

  generateEndpointRateLimitKey(endpoint: string, method: string): string {
    return `endpoint:${method}:${endpoint}`;
  }
}
