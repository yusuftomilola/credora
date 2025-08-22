import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '../redis/redis.module';
import { ApiGatewayController } from './api-gateway.controller';
import { ApiGatewayService } from './api-gateway.service';
import { RateLimitService } from './services/rate-limit.service';
import { LoadBalancerService } from './services/load-balancer.service';
import { AnalyticsService } from './services/analytics.service';
import { ApiKeyService } from './services/api-key.service';
import { TransformationService } from './services/transformation.service';
import { CircuitBreakerService } from './services/circuit-breaker.service';
import { ApiKey } from './entities/api-key.entity';
import { ApiUsage } from './entities/api-usage.entity';
import { ApiEndpoint } from './entities/api-endpoint.entity';
import { ServiceHealth } from './entities/service-health.entity';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { ApiKeyGuard } from './guards/api-key.guard';
import { AnalyticsInterceptor } from './interceptors/analytics.interceptor';
import { TransformationInterceptor } from './interceptors/transformation.interceptor';
import { CircuitBreakerInterceptor } from './interceptors/circuit-breaker.interceptor';
import { HealthMonitorService } from './services/health-monitor.service';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApiKey,
      ApiUsage,
      ApiEndpoint,
      ServiceHealth,
    ]),
    RedisModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [ApiGatewayController],
  providers: [
    ApiGatewayService,
    RateLimitService,
    LoadBalancerService,
    AnalyticsService,
    ApiKeyService,
    TransformationService,
    CircuitBreakerService,
    RateLimitGuard,
    ApiKeyGuard,
    HealthMonitorService,
    AnalyticsInterceptor,
    TransformationInterceptor,
    CircuitBreakerInterceptor,
  ],
  exports: [
    ApiGatewayService,
    RateLimitService,
    AnalyticsService,
    ApiKeyService,
  ],
})
export class ApiGatewayModule {}