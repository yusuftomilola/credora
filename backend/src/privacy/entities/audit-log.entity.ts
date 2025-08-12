import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @Column()
  action: string;

  @Column('json', { nullable: true })
  details: any;

  // High-level classification of event (e.g., user.activity, data.access, system.event, compliance.event)
  @Index()
  @Column({ default: 'user.activity' })
  eventType: string;

  // Target resource info for data access tracking
  @Index()
  @Column({ nullable: true })
  resource?: string;

  @Index()
  @Column({ nullable: true })
  resourceId?: string;

  // Result of the action (success/failure)
  @Index()
  @Column({ default: 'success' })
  outcome: string;

  // Request context
  @Column({ nullable: true })
  ip?: string;

  @Column({ nullable: true })
  userAgent?: string;

  @Index()
  @Column({ nullable: true })
  requestId?: string;

  @Column({ nullable: true })
  sessionId?: string;

  // Actor and service context
  @Index()
  @Column({ default: 'user' })
  actorType: string; // user | system | service

  @Index()
  @Column({ nullable: true })
  service?: string;

  // Tamper-evident chain
  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  prevHash?: string;

  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  hash?: string;

  // Anchoring/immutability
  @Index()
  @Column({ nullable: true })
  anchorCid?: string;

  // Sequencing within a day or stream
  @Index()
  @Column({ type: 'int', default: 0 })
  sequenceNumber: number;

  // Retention control
  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  retentionUntil?: Date;

  @CreateDateColumn()
  timestamp: Date;
}
