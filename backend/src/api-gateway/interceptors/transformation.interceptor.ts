import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { TransformationService, TransformationRule } from '../services/transformation.service';

export const TRANSFORMATION_RULES = 'transformationRules';
export const Transform = (rules: {
  request?: TransformationRule[];
  response?: TransformationRule[];
}) => Reflect.metadata(TRANSFORMATION_RULES, rules);

@Injectable()
export class TransformationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TransformationInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly transformationService: TransformationService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    
    const transformationRules = this.reflector.get<{
      request?: TransformationRule[];
      response?: TransformationRule[];
    }>(TRANSFORMATION_RULES, context.getHandler());

    if (transformationRules?.request && request.body) {
      try {
        request.body = this.transformationService.transformRequest(
          request.body,
          transformationRules.request,
        );
      } catch (error) {
        this.logger.error('Request transformation failed', error);
      }
    }

    if (transformationRules?.response) {
      return next.handle().pipe(
        map(data => {
          try {
            return this.transformationService.transformResponse(
              data,
              transformationRules.response!,
            );
          } catch (error) {
            this.logger.error('Response transformation failed', error);
            return data;
          }
        }),
      );
    }

    return next.handle();
  }
}