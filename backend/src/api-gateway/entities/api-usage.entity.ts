import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('api_usage')
@Index(['apiKeyId', 'timestamp'])
@Index(['endpoint', 'timestamp'])
export class ApiUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  apiKeyId: string;

  @Column()
  endpoint: string;

  @Column()
  method: string;

  @Column()
  statusCode: number;

  @Column({ type: 'bigint' })
  responseTime: number;

  @Column({ type: 'int', default: 0 })
  requestSize: number;

  @Column({ type: 'int', default: 0 })
  responseSize: number;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @Column()
  userAgent: string;

  @Column()
  ipAddress: string;

  @CreateDateColumn()
  timestamp: Date;
}


