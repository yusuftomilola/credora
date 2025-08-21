import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  Headers,
  Req,
  Res,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RateLimitGuard, RateLimit } from './guards/rate-limit.guard';
import {
  ApiKeyGuard,
  RequireApiKey,
  RequirePermissions,
} from './guards/api-key.guard';
import { AnalyticsInterceptor } from './interceptors/analytics.interceptor';
import {
  ApiGatewayService,
  EndpointRegistrationDto,
  EndpointFilter,
} from './api-gateway.service';
import {
  ApiKeyService,
  CreateApiKeyDto,
  UpdateApiKeyDto,
} from './services/api-key.service';
import { AnalyticsService } from './services/analytics.service';
import { LoadBalancerService } from './services/load-balancer.service';
import { CircuitBreakerService } from './services/circuit-breaker.service';
import { Request, Response } from 'express';
import { UserRole } from 'src/users/entities';

@ApiTags('API Gateway')
@Controller('api-gateway')
@UseInterceptors(AnalyticsInterceptor)
@ApiBearerAuth()
export class ApiGatewayController {
  constructor(
    private readonly apiGatewayService: ApiGatewayService,
    private readonly apiKeyService: ApiKeyService,
    private readonly analyticsService: AnalyticsService,
    private readonly loadBalancerService: LoadBalancerService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {}

  @Post('api-keys')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create new API key' })
  @ApiResponse({ status: 201, description: 'API key created successfully' })
  async createApiKey(
    @CurrentUser() user: { sub: string },
    @Body() createDto: CreateApiKeyDto,
  ) {
    return this.apiKeyService.createApiKey({
      ...createDto,
      userId: user.sub,
    });
  }

  @Get('api-keys')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get user API keys' })
  @ApiResponse({
    status: 200,
    description: 'User API keys retrieved successfully',
  })
  async getUserApiKeys(@CurrentUser() user: { sub: string }) {
    return this.apiKeyService.getUserApiKeys(user.sub);
  }

  @Get('api-keys/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get API key details' })
  async getApiKey(@Param('id') id: string) {
    return this.apiKeyService.getApiKey(id);
  }

  @Put('api-keys/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update API key' })
  async updateApiKey(
    @Param('id') id: string,
    @Body() updateDto: UpdateApiKeyDto,
  ) {
    return this.apiKeyService.updateApiKey(id, updateDto);
  }

  @Delete('api-keys/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete API key' })
  async deleteApiKey(@Param('id') id: string) {
    await this.apiKeyService.deleteApiKey(id);
    return { message: 'API key deleted successfully' };
  }

  @Post('api-keys/:id/deactivate')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Deactivate API key' })
  async deactivateApiKey(@Param('id') id: string) {
    await this.apiKeyService.deactivateApiKey(id);
    return { message: 'API key deactivated successfully' };
  }

  @Get('analytics/usage')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @ApiOperation({ summary: 'Get usage analytics' })
  @ApiResponse({
    status: 200,
    description: 'Usage analytics retrieved successfully',
  })
  async getUsageAnalytics(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('apiKeyId') apiKeyId?: string,
  ): Promise<any> {
    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    return this.analyticsService.getUsageMetrics(start, end, apiKeyId);
  }

  @Get('analytics/traffic')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @ApiOperation({ summary: 'Get traffic analytics' })
  async getTrafficAnalytics(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ): Promise<any> {
    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    return this.analyticsService.getTrafficAnalytics(start, end);
  }

  @Get('analytics/performance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @ApiOperation({ summary: 'Get performance metrics' })
  async getPerformanceMetrics(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ): Promise<any> {
    const start = startDate
      ? new Date(startDate)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    return this.analyticsService.getPerformanceMetrics(start, end);
  }

  @Get('health/:serviceName')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @ApiOperation({ summary: 'Get service health status' })
  async getServiceHealth(
    @Param('serviceName') serviceName: string,
  ): Promise<any> {
    return this.loadBalancerService.getServiceHealth(serviceName);
  }

  @Get('circuit-breakers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @ApiOperation({ summary: 'Get all circuit breaker statuses' })
  async getAllCircuitBreakers(): Promise<any> {
    return this.circuitBreakerService.getAllCircuitBreakers();
  }

  @Post('circuit-breakers/:serviceName/reset')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @ApiOperation({ summary: 'Reset circuit breaker' })
  async resetCircuitBreaker(@Param('serviceName') serviceName: string) {
    await this.circuitBreakerService.resetCircuitBreaker(serviceName);
    return { message: 'Circuit breaker reset successfully' };
  }

  @Post('endpoints')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Register new API endpoint' })
  async registerEndpoint(@Body() endpointData: EndpointRegistrationDto) {
    return this.apiGatewayService.registerEndpoint(endpointData);
  }

  @Get('endpoints')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @ApiOperation({ summary: 'Get all API endpoints' })
  async getEndpoints(
    @Query('version') version?: string,
    @Query('active') active?: string,
  ): Promise<any> {
    return this.apiGatewayService.getEndpoints({
      version,
      isActive: active ? active === 'true' : undefined,
    });
  }

  @Put('endpoints/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update API endpoint' })
  async updateEndpoint(
    @Param('id') id: string,
    @Body() updateData: Partial<EndpointRegistrationDto>,
  ) {
    return this.apiGatewayService.updateEndpoint(id, updateData);
  }

  @Delete('endpoints/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete API endpoint' })
  async deleteEndpoint(@Param('id') id: string) {
    await this.apiGatewayService.deleteEndpoint(id);
    return { message: 'Endpoint deleted successfully' };
  }

  @Post('endpoints/:endpointId/instances')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Add service instance to endpoint' })
  async addServiceInstance(
    @Param('endpointId') endpointId: string,
    @Body() instanceData: { id: string; url: string; [key: string]: any },
  ) {
    await this.loadBalancerService.addServiceInstance(endpointId, instanceData);
    return { message: 'Service instance added successfully' };
  }
  @Delete('endpoints/:endpointId/instances/:instanceId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Remove service instance from endpoint' })
  async removeServiceInstance(
    @Param('endpointId') endpointId: string,
    @Param('instanceId') instanceId: string,
  ) {
    await this.loadBalancerService.removeServiceInstance(
      endpointId,
      instanceId,
    );
    return { message: 'Service instance removed successfully' };
  }

  @Get('docs/openapi')
  @ApiOperation({ summary: 'Get OpenAPI specification' })
  async getOpenApiSpec(): Promise<any> {
    return this.apiGatewayService.generateOpenApiSpec();
  }

  @Get('test/rate-limit')
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60000, maxRequests: 10 })
  @ApiOperation({ summary: 'Test rate limiting' })
  async testRateLimit(): Promise<any> {
    return { message: 'Rate limit test passed', timestamp: new Date() };
  }

  @Get('test/api-key')
  @UseGuards(ApiKeyGuard)
  @RequireApiKey()
  @RequirePermissions('read')
  @ApiOperation({ summary: 'Test API key authentication' })
  async testApiKey(@Req() req: Request & { apiKey: any }) {
    return {
      message: 'API key test passed',
      apiKey: {
        id: req.apiKey.id,
        name: req.apiKey.name,
        permissions: req.apiKey.permissions,
      },
      timestamp: new Date(),
    };
  }

  @Get('proxy/*')
  @UseGuards(RateLimitGuard, ApiKeyGuard)
  @RequireApiKey()
  @ApiOperation({ summary: 'Proxy requests to backend services' })
  async proxyRequest(
    @Req() req: Request & { params: string[] },
    @Res() res: Response,
    @Headers() headers: Record<string, string>,
  ) {
    try {
      const path = req.params[0];
      const method = req.method;
      const version = headers['api-version'] || 'v1';

      const targetUrl = await this.loadBalancerService.routeRequest(
        path,
        method,
        version,
      );

      return this.apiGatewayService.proxyRequest(targetUrl, req, res);
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Proxy request failed',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
