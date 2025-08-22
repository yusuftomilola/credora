import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyService } from '../services/api-key.service';

export const API_KEY_REQUIRED = 'apiKeyRequired';
export const REQUIRED_PERMISSIONS = 'requiredPermissions';

export const RequireApiKey = () => SetMetadata(API_KEY_REQUIRED, true);
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const apiKeyRequired = this.reflector.getAllAndOverride<boolean>(
      API_KEY_REQUIRED,
      [context.getHandler(), context.getClass()],
    );

    if (!apiKeyRequired) {
      return true;
    }

    const apiKeyHeader = request.headers['x-api-key'];
    
    if (!apiKeyHeader) {
      throw new UnauthorizedException('API key is required');
    }

    try {
      const apiKey = await this.apiKeyService.validateApiKey(apiKeyHeader);
      
      if (!apiKey) {
        throw new UnauthorizedException('Invalid API key');
      }

      const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
        REQUIRED_PERMISSIONS,
        [context.getHandler(), context.getClass()],
      );

      if (requiredPermissions && requiredPermissions.length > 0) {
        const hasPermission = await this.checkPermissions(apiKey, requiredPermissions);
        
        if (!hasPermission) {
          throw new ForbiddenException('Insufficient permissions');
        }
      }

      request.apiKey = apiKey;

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
        throw error;
      }

      this.logger.error('API key validation failed', error);
      throw new UnauthorizedException('API key validation failed');
    }
  }

  private async checkPermissions(apiKey: any, requiredPermissions: string[]): Promise<boolean> {
    for (const permission of requiredPermissions) {
      const hasPermission = await this.apiKeyService.hasPermission(apiKey, permission);
      if (!hasPermission) {
        return false;
      }
    }
    return true;
  }
}