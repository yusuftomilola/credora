import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, throwError, from } from 'rxjs';
import { tap, catchError, mergeMap } from 'rxjs/operators';
import { CircuitBreakerService, CircuitBreakerConfig } from '../services/circuit-breaker.service';

export const CIRCUIT_BREAKER_CONFIG = 'circuitBreakerConfig';
export const CircuitBreaker = (config: CircuitBreakerConfig) =>
  Reflect.metadata(CIRCUIT_BREAKER_CONFIG, config);

@Injectable()
export class CircuitBreakerInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CircuitBreakerInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const serviceName = this.getServiceName(context, request);
    
    const config = this.reflector.get<CircuitBreakerConfig>(
      CIRCUIT_BREAKER_CONFIG,
      context.getHandler(),
    );

    return from(this.circuitBreakerService.checkCircuitBreaker(serviceName, config)).pipe(
      mergeMap(isAllowed => {
        if (!isAllowed) {
          this.logger.warn(`Circuit breaker is OPEN for service: ${serviceName}`);
          return throwError(() => new ServiceUnavailableException('Service is temporarily unavailable'));
        }

        return next.handle().pipe(
          tap(() => {
            this.circuitBreakerService.recordSuccess(serviceName, config).catch(err =>
              this.logger.error('Failed to record success', err),
            );
          }),
          catchError(error => {
            this.circuitBreakerService.recordFailure(serviceName, config).catch(err =>
              this.logger.error('Failed to record failure', err),
            );
            return throwError(() => error);
          }),
        );
      }),
    );
  }

  private getServiceName(context: ExecutionContext, request: any): string {
    const className = context.getClass().name;
    const handlerName = context.getHandler().name;
    const endpoint = `${request.method}_${request.route?.path || request.url}`;
    
    return `${className}_${handlerName}_${endpoint}`;
  }
}