import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// Import axios using require syntax to avoid TypeScript issues
const axios = require('axios');
import { ExperianAdapter } from './experian.adapter';
import { EquifaxAdapter } from './equifax.adapter';
import { TransUnionAdapter } from './transunion.adapter';
import { CreditBureauAdapter, NormalizedCreditReport } from './credit-bureau.adapter';
import * as CircuitBreaker from 'opossum';

/**
 * Types of credit bureaus supported by the system
 */
export type CreditBureauType = 'experian' | 'equifax' | 'transunion';

@Injectable()
export class CreditBureauService {
  private readonly logger = new Logger(CreditBureauService.name);
  private readonly adapters: Record<CreditBureauType, CreditBureauAdapter>;
  private readonly circuitBreakers: Record<CreditBureauType, CircuitBreaker>;
  
  constructor(private configService: ConfigService) {
    // Create base axios instance with common configuration
    const baseAxios = this.createBaseAxiosInstance();
    
    // Initialize adapters with environment-specific configurations
    this.adapters = {
      experian: new ExperianAdapter(
        this.createBureauSpecificAxios(baseAxios, 'experian')
      ),
      equifax: new EquifaxAdapter(
        this.createBureauSpecificAxios(baseAxios, 'equifax')
      ),
      transunion: new TransUnionAdapter(
        this.createBureauSpecificAxios(baseAxios, 'transunion')
      ),
    };
    
    // Set up circuit breakers for each adapter
    this.circuitBreakers = {
      experian: this.createCircuitBreaker('experian'),
      equifax: this.createCircuitBreaker('equifax'),
      transunion: this.createCircuitBreaker('transunion'),
    };
  }

  /**
   * Creates the base axios instance with interceptors for common behaviors
   */
  private createBaseAxiosInstance(): any {
    const instance = axios.create({});
    
    // Request interceptor for common headers, auth, etc.
    instance.interceptors.request.use((config) => {
      config.headers = {
        ...config.headers,
        'User-Agent': 'Credora/1.0',
        'Content-Type': 'application/json',
      };
      return config;
    });
    
    // Response interceptor for error handling, retries, etc.
    instance.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response) {
          // Server responded with error (4xx, 5xx)
          if (error.response.status === 429) {
            // Handle rate limiting with exponential backoff
            const retryAfter = error.response.headers['retry-after'] || 1;
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            return instance(error.config);
          }
        }
        return Promise.reject(error);
      }
    );
    
    return instance;
  }
  
  /**
   * Creates bureau-specific axios instance with appropriate auth/config
   */
  private createBureauSpecificAxios(
    baseAxios: any, 
    bureau: CreditBureauType
  ): any {
    const instance = axios.create({});
    
    // Copy interceptors from base instance
    const reqInterceptorId = baseAxios.interceptors.request.handlers[0].id;
    const resInterceptorId = baseAxios.interceptors.response.handlers[0].id;
    
    instance.interceptors.request.use(
      baseAxios.interceptors.request.handlers[reqInterceptorId].fulfilled,
      baseAxios.interceptors.request.handlers[reqInterceptorId].rejected,
    );
    
    instance.interceptors.response.use(
      baseAxios.interceptors.response.handlers[resInterceptorId].fulfilled,
      baseAxios.interceptors.response.handlers[resInterceptorId].rejected,
    );
    
    // Add bureau-specific configuration
    instance.interceptors.request.use((config) => {
      // Get credentials from config service
      const apiKey = this.configService.get<string>(`creditBureau.${bureau}.apiKey`);
      const isSandbox = this.configService.get<boolean>(`creditBureau.${bureau}.sandbox`, true);
      
      // Set base URL based on environment
      config.baseURL = isSandbox 
        ? this.configService.get<string>(`creditBureau.${bureau}.sandboxUrl`)
        : this.configService.get<string>(`creditBureau.${bureau}.productionUrl`);
      
      // Add authentication
      config.headers = {
        ...config.headers,
        'Authorization': `Bearer ${apiKey}`,
      };
      
      return config;
    });
    
    return instance;
  }
  
  /**
   * Creates a circuit breaker for a specific bureau
   */
  private createCircuitBreaker(bureau: CreditBureauType): CircuitBreaker {
    const options = {
      timeout: 10000, // Time in ms before request is considered failed
      errorThresholdPercentage: 50, // Error % threshold to trip circuit
      resetTimeout: 30000, // Time in ms to wait before trying again
    };
    
    return new CircuitBreaker(
      async (userId: string, extra?: any) => {
        return this.adapters[bureau].getCreditReport(userId, extra);
      },
      options
    );
  }

  /**
   * Gets a credit report from the specified bureau
   */
  async getCreditReport(
    bureau: CreditBureauType, 
    userId: string, 
    extra?: any
  ): Promise<NormalizedCreditReport> {
    try {
      // Use circuit breaker to call adapter
      const report = await this.circuitBreakers[bureau].fire(userId, extra);
      return report;
    } catch (error) {
      // Handle circuit breaker or adapter errors
      if (error.type === 'open') {
        throw new Error(`${bureau} API is currently unavailable. Please try again later.`);
      }
      throw error;
    }
  }
  
  /**
   * Gets credit reports from all available bureaus
   */
  async getAllCreditReports(userId: string): Promise<Record<CreditBureauType, NormalizedCreditReport>> {
    const reports: Partial<Record<CreditBureauType, NormalizedCreditReport>> = {};
    
    // Make concurrent requests to all bureaus
    const promises = Object.keys(this.adapters).map(async (bureau) => {
      try {
        reports[bureau as CreditBureauType] = await this.getCreditReport(
          bureau as CreditBureauType,
          userId
        );
      } catch (error) {
        // Failures from one bureau shouldn't prevent others from returning
        this.logger.error(`Failed to get ${bureau} credit report:`, error.stack);
      }
    });
    
    await Promise.all(promises);
    return reports as Record<CreditBureauType, NormalizedCreditReport>;
  }
  
  /**
   * Handles a webhook from a credit bureau
   */
  async handleWebhook(bureau: CreditBureauType, payload: any): Promise<void> {
    return this.adapters[bureau].handleWebhook(payload);
  }
}
