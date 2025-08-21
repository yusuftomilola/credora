import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('service_health')
@Index(['serviceName', 'timestamp'])
export class ServiceHealth {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  serviceName: string;

  @Column()
  endpoint: string;

  @Column()
  status: 'healthy' | 'unhealthy' | 'degraded';

  @Column({ type: 'int' })
  responseTime: number;

  @Column({ nullable: true })
  errorMessage: string;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  timestamp: Date;
}