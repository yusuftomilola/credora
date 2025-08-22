import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  monitoringPeriod: number;
}

export interface CircuitBreakerStatus {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  nextAttempt: Date | null;
  lastFailureTime: Date | null;
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 60000, 
    monitoringPeriod: 60000, 
  };

  constructor(private readonly redisService: RedisService) {}

  async checkCircuitBreaker(
    serviceName: string,
    config: CircuitBreakerConfig = this.defaultConfig,
  ): Promise<boolean> {
    try {
      const status = await this.getCircuitBreakerStatus(serviceName, config);

      switch (status.state) {
        case CircuitBreakerState.CLOSED:
          return true;

        case CircuitBreakerState.OPEN:
          if (status.nextAttempt && Date.now() >= status.nextAttempt.getTime()) {
            await this.transitionToHalfOpen(serviceName);
            return true;
          }
          return false;

        case CircuitBreakerState.HALF_OPEN:
          return true;

        default:
          return true;
      }
    } catch (error) {
      this.logger.error('Circuit breaker check failed', error);
      return true;
    }
  }

  async recordSuccess(serviceName: string, config: CircuitBreakerConfig = this.defaultConfig): Promise<void> {
    try {
      const status = await this.getCircuitBreakerStatus(serviceName, config);

      if (status.state === CircuitBreakerState.HALF_OPEN) {
        const newSuccessCount = status.successCount + 1;
        
        if (newSuccessCount >= config.successThreshold) {
          await this.transitionToClosed(serviceName);
        } else {
          await this.incrementSuccessCount(serviceName);
        }
      } else if (status.state === CircuitBreakerState.CLOSED) {
        await this.resetFailureCount(serviceName);
      }
    } catch (error) {
      this.logger.error('Failed to record success', error);
    }
  }

  async recordFailure(serviceName: string, config: CircuitBreakerConfig = this.defaultConfig): Promise<void> {
    try {
      const status = await this.getCircuitBreakerStatus(serviceName, config);

      if (status.state === CircuitBreakerState.HALF_OPEN) {
        await this.transitionToOpen(serviceName, config);
      } else if (status.state === CircuitBreakerState.CLOSED) {
        const newFailureCount = status.failureCount + 1;
        
        if (newFailureCount >= config.failureThreshold) {
          await this.transitionToOpen(serviceName, config);
        } else {
          await this.incrementFailureCount(serviceName);
        }
      }
    } catch (error) {
      this.logger.error('Failed to record failure', error);
    }
  }

  async getCircuitBreakerStatus(
    serviceName: string,
    config: CircuitBreakerConfig,
  ): Promise<CircuitBreakerStatus> {
    const key = this.getRedisKey(serviceName);
    const data = await this.redisService.get(key);

    if (!data) {
      return {
        state: CircuitBreakerState.CLOSED,
        failureCount: 0,
        successCount: 0,
        nextAttempt: null,
        lastFailureTime: null,
      };
    }

    const parsed = JSON.parse(data);
    return {
      ...parsed,
      nextAttempt: parsed.nextAttempt ? new Date(parsed.nextAttempt) : null,
      lastFailureTime: parsed.lastFailureTime ? new Date(parsed.lastFailureTime) : null,
    };
  }

  async resetCircuitBreaker(serviceName: string): Promise<void> {
    const key = this.getRedisKey(serviceName);
    await this.redisService.del(key);
    this.logger.log(`Circuit breaker reset for service: ${serviceName}`);
  }

  async getAllCircuitBreakers(): Promise<Record<string, CircuitBreakerStatus>> {
    try {
      const pattern = 'circuit_breaker:*';
      const keys = await this.redisService.keys(pattern);
      const result: Record<string, CircuitBreakerStatus> = {};

      for (const key of keys) {
        const serviceName = key.replace('circuit_breaker:', '');
        const data = await this.redisService.get(key);
        
        if (data) {
          const parsed = JSON.parse(data);
          result[serviceName] = {
            ...parsed,
            nextAttempt: parsed.nextAttempt ? new Date(parsed.nextAttempt) : null,
            lastFailureTime: parsed.lastFailureTime ? new Date(parsed.lastFailureTime) : null,
          };
        }
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to get all circuit breakers', error);
      return {};
    }
  }

  private async transitionToClosed(serviceName: string): Promise<void> {
    const key = this.getRedisKey(serviceName);
    const status = {
      state: CircuitBreakerState.CLOSED,
      failureCount: 0,
      successCount: 0,
      nextAttempt: null,
      lastFailureTime: null,
    };

    await this.redisService.set(key, JSON.stringify(status), 3600); 
    this.logger.log(`Circuit breaker closed for service: ${serviceName}`);
  }

  private async transitionToOpen(serviceName: string, config: CircuitBreakerConfig): Promise<void> {
    const key = this.getRedisKey(serviceName);
    const nextAttempt = new Date(Date.now() + config.timeout);
    
    const status = {
      state: CircuitBreakerState.OPEN,
      failureCount: 0, 
      successCount: 0,
      nextAttempt: nextAttempt.toISOString(),
      lastFailureTime: new Date().toISOString(),
    };

    await this.redisService.set(key, JSON.stringify(status), Math.ceil(config.timeout / 1000) + 3600);
    this.logger.warn(`Circuit breaker opened for service: ${serviceName}, next attempt at: ${nextAttempt}`);
  }

  private async transitionToHalfOpen(serviceName: string): Promise<void> {
    const key = this.getRedisKey(serviceName);
    const currentData = await this.redisService.get(key);
    const current = currentData ? JSON.parse(currentData) : {};

    const status = {
      ...current,
      state: CircuitBreakerState.HALF_OPEN,
      successCount: 0,
      nextAttempt: null,
    };

    await this.redisService.set(key, JSON.stringify(status), 3600);
    this.logger.log(`Circuit breaker half-opened for service: ${serviceName}`);
  }

  private async incrementFailureCount(serviceName: string): Promise<void> {
    const key = this.getRedisKey(serviceName);
    const currentData = await this.redisService.get(key);
    const current = currentData ? JSON.parse(currentData) : { failureCount: 0, successCount: 0 };

    const status = {
      ...current,
      failureCount: current.failureCount + 1,
      lastFailureTime: new Date().toISOString(),
    };

    await this.redisService.set(key, JSON.stringify(status), 3600);
  }

  private async incrementSuccessCount(serviceName: string): Promise<void> {
    const key = this.getRedisKey(serviceName);
    const currentData = await this.redisService.get(key);
    const current = currentData ? JSON.parse(currentData) : { failureCount: 0, successCount: 0 };

    const status = {
      ...current,
      successCount: current.successCount + 1,
    };

    await this.redisService.set(key, JSON.stringify(status), 3600);
  }

  private async resetFailureCount(serviceName: string): Promise<void> {
    const key = this.getRedisKey(serviceName);
    const currentData = await this.redisService.get(key);
    
    if (currentData) {
      const current = JSON.parse(currentData);
      const status = {
        ...current,
        failureCount: 0,
      };

      await this.redisService.set(key, JSON.stringify(status), 3600);
    }
  }

  private getRedisKey(serviceName: string): string {
    return `circuit_breaker:${serviceName}`;
  }
}