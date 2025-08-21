import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { ApiGatewayService } from '../api-gateway.service';

async function initializeDefaultEndpoints() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const apiGatewayService = app.get(ApiGatewayService);

  const defaultEndpoints = [
    {
      path: '/auth/login',
      method: 'POST',
      version: 'v1',
      targetUrl: 'http://localhost:3000/auth/login',
      rateLimitConfig: {
        windowMs: 900000, 
        maxRequests: 5,   
      },
    },
    {
      path: '/users/:id',
      method: 'GET',
      version: 'v1',
      targetUrl: 'http://localhost:3000/users',
      transformationRules: {
        response: [
          { type: 'filter', field: 'password' }, 
          { type: 'rename', source: 'id', target: 'userId' },
        ],
      },
    },
    {
      path: '/banking/accounts',
      method: 'GET',
      version: 'v1',
      targetUrl: 'http://localhost:3000/banking/accounts',
      circuitBreakerConfig: {
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 30000,
      },
    },
    {
      path: '/screening/check',
      method: 'POST',
      version: 'v1',
      targetUrl: 'http://localhost:3000/screening/check',
      rateLimitConfig: {
        windowMs: 60000,  
        maxRequests: 10, 
      circuitBreakerConfig: {
        failureThreshold: 5,
        successThreshold: 3,
        timeout: 60000,
      },
    },
    },  
  ];

  for (const endpoint of defaultEndpoints) {
    try {
      await apiGatewayService.registerEndpoint(endpoint);
      console.log(` Registered endpoint: ${endpoint.method} ${endpoint.path}`);
    } catch (error) {
      console.error(` Failed to register endpoint: ${endpoint.method} ${endpoint.path}`, error.message);
    }
  }

  await app.close();
  console.log(' Default endpoints initialization completed');
}