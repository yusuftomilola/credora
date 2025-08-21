import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { AnalyticsService } from '../services/analytics.service';

@Injectable()
export class AnalyticsInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AnalyticsInterceptor.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const startTime = Date.now();

    // Extract request information
    const {
      method,
      url,
      headers,
      ip,
      body,
    } = request;

    const apiKeyId = request.apiKey?.id || 'anonymous';
    const userAgent = headers['user-agent'] || 'unknown';
    const requestSize = this.calculateRequestSize(request);

    return next.handle().pipe(
      tap((responseData) => {
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        const responseSize = this.calculateResponseSize(responseData);

        this.recordUsage({
          apiKeyId,
          endpoint: this.extractEndpoint(url),
          method: method.toUpperCase(),
          statusCode: response.statusCode || 200,
          responseTime,
          requestSize,
          responseSize,
          userAgent,
          ipAddress: this.getClientIp(request),
          metadata: this.extractMetadata(request, response, responseData),
        });
      }),
      catchError((error) => {
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        const statusCode = error.status || error.statusCode || 500;

        this.recordUsage({
          apiKeyId,
          endpoint: this.extractEndpoint(url),
          method: method.toUpperCase(),
          statusCode,
          responseTime,
          requestSize,
          responseSize: 0,
          userAgent,
          ipAddress: this.getClientIp(request),
          metadata: {
            error: error.message,
            stack: error.stack,
          },
        });

        return throwError(() => error);
      }),
    );
  }

  private async recordUsage(data: any): Promise<void> {
    try {
      await this.analyticsService.recordUsage(data);
    } catch (error) {
      this.logger.error('Failed to record analytics', error);
    }
  }

  private calculateRequestSize(request: any): number {
    try {
      let size = 0;
      
      if (request.headers) {
        const headersStr = JSON.stringify(request.headers);
        size += Buffer.byteLength(headersStr, 'utf8');
      }

      if (request.body) {
        const bodyStr = typeof request.body === 'string' 
          ? request.body 
          : JSON.stringify(request.body);
        size += Buffer.byteLength(bodyStr, 'utf8');
      }

      if (request.url) {
        size += Buffer.byteLength(request.url, 'utf8');
      }

      return size;
    } catch (error) {
      this.logger.warn('Failed to calculate request size', error);
      return 0;
    }
  }

  private calculateResponseSize(responseData: any): number {
    try {
      if (!responseData) return 0;

      const responseStr = typeof responseData === 'string' 
        ? responseData 
        : JSON.stringify(responseData);
      
      return Buffer.byteLength(responseStr, 'utf8');
    } catch (error) {
      this.logger.warn('Failed to calculate response size', error);
      return 0;
    }
  }

  private extractEndpoint(url: string): string {
    try {
      const cleanUrl = url.split('?')[0];
      
      return cleanUrl.replace(/^\/api\/v\d+/, '').replace(/^\/v\d+/, '') || '/';
    } catch (error) {
      return url || '/unknown';
    }
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

  private extractMetadata(request: any, response: any, responseData: any): Record<string, any> {
    const metadata: Record<string, any> = {};

    if (request.headers?.['content-type']) {
      metadata.contentType = request.headers['content-type'];
    }

    if (request.headers?.['accept']) {
      metadata.accept = request.headers['accept'];
    }

    if (response.getHeaders) {
      const headers = response.getHeaders();
      if (headers['content-type']) {
        metadata.responseContentType = headers['content-type'];
      }
    }

    if (request.apiKey) {
      metadata.apiKeyName = request.apiKey.name;
      metadata.userId = request.apiKey.userId;
    }

    if (request.user) {
      metadata.authenticatedUser = request.user.sub;
    }

    return metadata;
  }
}