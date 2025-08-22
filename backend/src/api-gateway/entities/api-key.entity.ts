import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('api_keys')
@Index(['key'])
@Index(['userId'])
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  key: string;

  @Column()
  userId: string;

  @Column({ nullable: true })
  name: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'json', nullable: true })
  permissions: string[];

  @Column({ type: 'int', default: 1000 })
  rateLimit: number;

  @Column({ default: 'hour' })
  rateLimitPeriod: string;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}