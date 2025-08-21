import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { ApiEndpoint } from '../entities/api-endpoint.entity';
import { ServiceHealth } from '../entities/service-health.entity';
import { CircuitBreakerService } from './circuit-breaker.service';
import * as http from 'http';
import * as https from 'https';

export enum LoadBalancingStrategy {
  ROUND_ROBIN = 'ROUND_ROBIN',
  WEIGHTED_ROUND_ROBIN = 'WEIGHTED_ROUND_ROBIN',
  LEAST_CONNECTIONS = 'LEAST_CONNECTIONS',
  RANDOM = 'RANDOM',
  HEALTH_BASED = 'HEALTH_BASED',
}

export interface ServiceInstance {
  id: string;
  url: string;
  weight?: number;
  connections?: number;
  isHealthy?: boolean;
  lastHealthCheck?: Date;
}

export interface LoadBalancerConfig {
  strategy: LoadBalancingStrategy;
  healthCheckInterval: number;
  healthCheckTimeout: number;
  maxRetries: number;
}

@Injectable()
export class LoadBalancerService {
  private readonly logger = new Logger(LoadBalancerService.name);
  private readonly roundRobinCounters = new Map<string, number>();
  private readonly connectionCounts = new Map<string, number>();
  private healthCheckIntervals = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectRepository(ApiEndpoint)
    private readonly endpointRepository: Repository<ApiEndpoint>,
    @InjectRepository(ServiceHealth)
    private readonly healthRepository: Repository<ServiceHealth>,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {
    this.initializeHealthChecks();
  }

  async routeRequest(
    path: string,
    method: string,
    version: string = 'v1',
  ): Promise<string> {
    const endpoint = await this.findEndpoint(path, method, version);
    
    if (!endpoint || !endpoint.isActive) {
      throw new HttpException('Endpoint not found', HttpStatus.NOT_FOUND);
    }

    const instances = this.parseServiceInstances(endpoint.targetUrl);
    const availableInstances = await this.filterHealthyInstances(instances);

    if (availableInstances.length === 0) {
      throw new HttpException('No healthy instances available', HttpStatus.SERVICE_UNAVAILABLE);
    }

    const config: LoadBalancerConfig = {
      strategy: LoadBalancingStrategy.ROUND_ROBIN,
      healthCheckInterval: 30000,
      healthCheckTimeout: 5000,
      maxRetries: 3,
      ...endpoint.circuitBreakerConfig,
    };

    const selectedInstance = this.selectInstance(
      availableInstances,
      config.strategy,
      `${method}:${path}`,
    );

    return this.buildTargetUrl(selectedInstance, endpoint);
  }

  async addServiceInstance(
    endpointId: string,
    instance: ServiceInstance,
  ): Promise<void> {
    const endpoint = await this.endpointRepository.findOne({
      where: { id: endpointId },
    });

    if (!endpoint) {
      throw new HttpException('Endpoint not found', HttpStatus.NOT_FOUND);
    }

    const instances = this.parseServiceInstances(endpoint.targetUrl);
    instances.push(instance);

    endpoint.targetUrl = this.serializeServiceInstances(instances);
    await this.endpointRepository.save(endpoint);

    this.startHealthCheck(instance);

    this.logger.log(`Added service instance ${instance.id} to endpoint ${endpointId}`);
  }

  async removeServiceInstance(
    endpointId: string,
    instanceId: string,
  ): Promise<void> {
    const endpoint = await this.endpointRepository.findOne({
      where: { id: endpointId },
    });

    if (!endpoint) {
      throw new HttpException('Endpoint not found', HttpStatus.NOT_FOUND);
    }

    const instances = this.parseServiceInstances(endpoint.targetUrl);
    const filteredInstances = instances.filter(i => i.id !== instanceId);

    endpoint.targetUrl = this.serializeServiceInstances(filteredInstances);
    await this.endpointRepository.save(endpoint);

    this.stopHealthCheck(instanceId);

    this.logger.log(`Removed service instance ${instanceId} from endpoint ${endpointId}`);
  }

  async getServiceHealth(serviceName: string): Promise<ServiceHealth[]> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    return this.healthRepository.find({
      where: {
        serviceName,
        timestamp: MoreThanOrEqual(oneHourAgo),
      },
      order: { timestamp: 'DESC' },
      take: 100,
    });
  }

  private async findEndpoint(
    path: string,
    method: string,
    version: string,
  ): Promise<ApiEndpoint | null> {
    let endpoint = await this.endpointRepository.findOne({
      where: { path, method: method.toUpperCase(), version },
    });

    if (endpoint) return endpoint;

    const allEndpoints = await this.endpointRepository.find({
      where: { method: method.toUpperCase(), version },
    });

    for (const ep of allEndpoints) {
      if (this.matchPath(path, ep.path)) {
        return ep;
      }
    }

    return null;
  }

  private matchPath(requestPath: string, endpointPath: string): boolean {
    const pattern = endpointPath
      .replace(/:\w+/g, '[^/]+') 
      .replace(/\*/g, '.*'); 

    const regex = new RegExp(`^${pattern}$`);
    return regex.test(requestPath);
  }

  private parseServiceInstances(targetUrl: string): ServiceInstance[] {
    try {
      if (targetUrl.startsWith('http')) {
        return [{
          id: this.generateInstanceId(targetUrl),
          url: targetUrl,
          weight: 1,
          connections: 0,
          isHealthy: true,
        }];
      }

      return JSON.parse(targetUrl).map((instance: any) => ({
        ...instance,
        connections: this.connectionCounts.get(instance.id) || 0,
      }));
    } catch (error) {
      this.logger.error('Failed to parse service instances', error);
      return [];
    }
  }

  private serializeServiceInstances(instances: ServiceInstance[]): string {
    if (instances.length === 1) {
      return instances[0].url;
    }

    return JSON.stringify(instances.map(({ connections, ...instance }) => instance));
  }

  private async filterHealthyInstances(instances: ServiceInstance[]): Promise<ServiceInstance[]> {
    const healthyInstances: ServiceInstance[] = [];

    for (const instance of instances) {
      const isCircuitBreakerOpen = !(await this.circuitBreakerService.checkCircuitBreaker(
        instance.id,
      ));

      if (!isCircuitBreakerOpen && instance.isHealthy !== false) {
        healthyInstances.push(instance);
      }
    }

    return healthyInstances;
  }
  private selectLeastConnections(instances: ServiceInstance[]): ServiceInstance {
    return instances.reduce((least, current) => 
      (current.connections || 0) < (least.connections || 0) ? current : least
    );
  }

  private selectRandom(instances: ServiceInstance[]): ServiceInstance {
    const randomIndex = Math.floor(Math.random() * instances.length);
    return instances[randomIndex];
  }

  private selectHealthBased(instances: ServiceInstance[]): ServiceInstance {
    return this.selectRoundRobin(instances, 'health_based');
  }

  private buildTargetUrl(instance: ServiceInstance, endpoint: ApiEndpoint): string {
    const baseUrl = instance.url.replace(/\/$/, '');
    const path = endpoint.path.startsWith('/') ? endpoint.path : `/${endpoint.path}`;
    return `${baseUrl}${path}`;
  }

  private generateInstanceId(url: string): string {
    return Buffer.from(url).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 8);
  }

  private async initializeHealthChecks(): Promise<void> {
    try {
      const endpoints = await this.endpointRepository.find({ where: { isActive: true } });
      
      for (const endpoint of endpoints) {
        const instances = this.parseServiceInstances(endpoint.targetUrl);
        instances.forEach(instance => this.startHealthCheck(instance));
      }
    } catch (error) {
      this.logger.error('Failed to initialize health checks', error);
    }
  }

  private startHealthCheck(instance: ServiceInstance): void {
    this.stopHealthCheck(instance.id);

    const interval = setInterval(async () => {
      await this.performHealthCheck(instance);
    }, 30000); 

    this.healthCheckIntervals.set(instance.id, interval);
    
    this.performHealthCheck(instance);
  }

  private stopHealthCheck(instanceId: string): void {
    const interval = this.healthCheckIntervals.get(instanceId);
    if (interval) {
      clearInterval(interval);
      this.healthCheckIntervals.delete(instanceId);
    }
  }

  private async performHealthCheck(instance: ServiceInstance): Promise<void> {
    const startTime = Date.now();
    let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    let errorMessage: string | null = null;

    try {
      const healthUrl = `${instance.url}/health`;
      const isHealthy = await this.checkUrl(healthUrl, 5000);
      
      const responseTime = Date.now() - startTime;
      
      if (!isHealthy) {
        status = 'unhealthy';
        errorMessage = 'Health check failed';
      } else if (responseTime > 2000) {
        status = 'degraded';
        errorMessage = 'High response time';
      }

      instance.isHealthy = status === 'healthy';
      instance.lastHealthCheck = new Date();

      await this.recordHealthCheck(instance, status, responseTime, errorMessage);

      if (status === 'healthy') {
        await this.circuitBreakerService.recordSuccess(instance.id);
      } else {
        await this.circuitBreakerService.recordFailure(instance.id);
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      status = 'unhealthy';
      errorMessage = error.message;
      
      instance.isHealthy = false;
      instance.lastHealthCheck = new Date();

      await this.recordHealthCheck(instance, status, responseTime, errorMessage);
      await this.circuitBreakerService.recordFailure(instance.id);
    }
  }

  private async checkUrl(url: string, timeout: number): Promise<boolean> {
    return new Promise((resolve) => {
      const isHttps = url.startsWith('https');
      const client = isHttps ? https : http;
      
      const timer = setTimeout(() => {
        resolve(false);
      }, timeout);

      const req = client.get(url, (res) => {
        clearTimeout(timer);
        resolve(res.statusCode === 200);
      });

      req.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });

      req.setTimeout(timeout, () => {
        clearTimeout(timer);
        req.destroy();
        resolve(false);
      });
    });
  }

  private async recordHealthCheck(
    instance: ServiceInstance,
    status: 'healthy' | 'unhealthy' | 'degraded',
    responseTime: number,
    errorMessage: string | null,
  ): Promise<void> {
    try {
      const healthRecord = this.healthRepository.create({
        serviceName: instance.id,
        endpoint: instance.url,
        status,
        responseTime,
        errorMessage: errorMessage || undefined,
        metadata: {
          instanceId: instance.id,
          weight: instance.weight,
        },
      });

      await this.healthRepository.save(healthRecord);
    } catch (error) {
      this.logger.error('Failed to record health check', error);
    }
  }

  incrementConnectionCount(instanceId: string): void {
    const current = this.connectionCounts.get(instanceId) || 0;
    this.connectionCounts.set(instanceId, current + 1);
  }

  decrementConnectionCount(instanceId: string): void {
    const current = this.connectionCounts.get(instanceId) || 0;
    this.connectionCounts.set(instanceId, Math.max(0, current - 1));
  }

  private selectInstance(
    instances: ServiceInstance[],
    strategy: LoadBalancingStrategy,
    routeKey: string,
  ): ServiceInstance {
    switch (strategy) {
      case LoadBalancingStrategy.ROUND_ROBIN:
        return this.selectRoundRobin(instances, routeKey);

      case LoadBalancingStrategy.WEIGHTED_ROUND_ROBIN:
        return this.selectWeightedRoundRobin(instances, routeKey);

      case LoadBalancingStrategy.LEAST_CONNECTIONS:
        return this.selectLeastConnections(instances);

      case LoadBalancingStrategy.RANDOM:
        return this.selectRandom(instances);

      case LoadBalancingStrategy.HEALTH_BASED:
        return this.selectHealthBased(instances);

      default:
        return this.selectRoundRobin(instances, routeKey);
    }
  }

  private selectRoundRobin(instances: ServiceInstance[], routeKey: string): ServiceInstance {
    const currentIndex = this.roundRobinCounters.get(routeKey) || 0;
    const selectedInstance = instances[currentIndex % instances.length];
    
    this.roundRobinCounters.set(routeKey, currentIndex + 1);
    return selectedInstance;
  }

  private selectWeightedRoundRobin(instances: ServiceInstance[], routeKey: string): ServiceInstance {
    const totalWeight = instances.reduce((sum, instance) => sum + (instance.weight || 1), 0);
    const currentIndex = this.roundRobinCounters.get(routeKey) || 0;
    
    let weightSum = 0;
    const targetWeight = (currentIndex % totalWeight) + 1;
    
    for (const instance of instances) {
      weightSum += instance.weight || 1;
      if (weightSum >= targetWeight) {
        return instance;
      }
    }
    
    return instances[0];
  }
}