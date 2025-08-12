import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { AuditService } from './audit.service';
import type { CreateAuditLogInput } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const userId: string | undefined = req.user?.id || req.user?.userId || undefined;
    const requestId: string | undefined = (req.headers['x-request-id'] as string) || (req.id as string | undefined);
    const sessionId: string | undefined = req.session?.id as string | undefined;
    const ip = (req.ip as string) || (req.headers['x-forwarded-for'] as string) || (req.connection?.remoteAddress as string | undefined);
    const userAgent = req.headers['user-agent'] as string | undefined;
    const action = `${req.method} ${req.route?.path || req.url}`;
    const resource = (req.route?.path || req.path) as string | undefined;

    const common: CreateAuditLogInput = {
      userId,
      action,
      eventType: 'user.activity',
      resource,
      outcome: 'success',
      ip: typeof ip === 'string' ? ip : Array.isArray(ip as any) ? (ip as any)[0] : undefined,
      userAgent,
      requestId: typeof requestId === 'string' ? requestId : undefined,
      sessionId,
      actorType: (userId ? 'user' : 'system'),
      details: { params: req.params, query: req.query, bodyKeys: Object.keys(req.body || {}) },
    };

    return next.handle().pipe(
      tap(async () => {
        try {
          await this.auditService.recordLog(common);
        } catch {}
      }),
      catchError((err, caught) => {
        // Record failure outcome
        try {
          this.auditService.recordLog({ ...common, outcome: 'failure', details: { error: err?.message } });
        } catch {}
        throw err;
      }) as any,
    );
  }
}


