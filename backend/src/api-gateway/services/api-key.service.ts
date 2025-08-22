import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKey } from '../entities/api-key.entity';
import * as crypto from 'crypto';

export interface CreateApiKeyDto {
  userId: string;
  name?: string;
  permissions?: string[];
  rateLimit?: number;
  rateLimitPeriod?: string;
  expiresAt?: Date;
}

export interface UpdateApiKeyDto {
  name?: string;
  permissions?: string[];
  rateLimit?: number;
  rateLimitPeriod?: string;
  isActive?: boolean;
  expiresAt?: Date;
}

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
  ) {}

  async createApiKey(createDto: CreateApiKeyDto): Promise<ApiKey> {
    const key = this.generateApiKey();
    
    const apiKey = this.apiKeyRepository.create({
      key,
      userId: createDto.userId,
      name: createDto.name,
      permissions: createDto.permissions || [],
      rateLimit: createDto.rateLimit || 1000,
      rateLimitPeriod: createDto.rateLimitPeriod || 'hour',
      expiresAt: createDto.expiresAt,
    });

    const saved = await this.apiKeyRepository.save(apiKey);
    this.logger.log(`Created API key for user ${createDto.userId}`);
    
    return saved;
  }

  async validateApiKey(key: string): Promise<ApiKey | null> {
    try {
      const apiKey = await this.apiKeyRepository.findOne({
        where: { key, isActive: true },
      });

      if (!apiKey) {
        return null;
      }

      // Check if key has expired
      if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
        await this.deactivateApiKey(apiKey.id);
        return null;
      }

      // Update last used timestamp
      await this.updateLastUsed(apiKey.id);

      return apiKey;
    } catch (error) {
      this.logger.error('API key validation failed', error);
      return null;
    }
  }

  async updateApiKey(id: string, updateDto: UpdateApiKeyDto): Promise<ApiKey> {
    const apiKey = await this.apiKeyRepository.findOne({ where: { id } });
    
    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    Object.assign(apiKey, updateDto);
    const updated = await this.apiKeyRepository.save(apiKey);
    
    this.logger.log(`Updated API key ${id}`);
    return updated;
  }

  async deactivateApiKey(id: string): Promise<void> {
    await this.apiKeyRepository.update(id, { isActive: false });
    this.logger.log(`Deactivated API key ${id}`);
  }

  async deleteApiKey(id: string): Promise<void> {
    await this.apiKeyRepository.delete(id);
    this.logger.log(`Deleted API key ${id}`);
  }

  async getUserApiKeys(userId: string): Promise<ApiKey[]> {
    return this.apiKeyRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getApiKey(id: string): Promise<ApiKey> {
    const apiKey = await this.apiKeyRepository.findOne({ where: { id } });
    
    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    return apiKey;
  }

  async hasPermission(apiKey: ApiKey, permission: string): Promise<boolean> {
    if (!apiKey.permissions || apiKey.permissions.length === 0) {
      return true; 
    }

    return apiKey.permissions.includes(permission) || apiKey.permissions.includes('*');
  }

  private generateApiKey(): string {
    const prefix = 'ck_';
    const randomBytes = crypto.randomBytes(32);
    return prefix + randomBytes.toString('hex');
  }

  private async updateLastUsed(id: string): Promise<void> {
    try {
      await this.apiKeyRepository.update(id, { lastUsedAt: new Date() });
    } catch (error) {
      this.logger.warn(`Failed to update last used timestamp for API key ${id}`, error);
    }
  }
}