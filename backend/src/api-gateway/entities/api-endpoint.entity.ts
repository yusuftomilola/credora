// src/api-gateway/entities/api-endpoint.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('api_endpoints')
@Index(['path', 'method'])
@Index(['version'])
export class ApiEndpoint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  path: string;

  @Column()
  method: string;

  @Column()
  version: string;

  @Column()
  targetUrl: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'json', nullable: true })
  transformationRules: Record<string, any>;

  @Column({ type: 'json', nullable: true })
  rateLimitConfig: Record<string, any>;

  @Column({ type: 'json', nullable: true })
  circuitBreakerConfig: Record<string, any>;

  @Column({ type: 'json', nullable: true })
  headers: Record<string, string>;

  @Column({ type: 'int', default: 30000 })
  timeout: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
