import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'bank_tokens' })
export class BankToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  provider: string; // 'plaid', 'yodlee', 'openbanking-uk', ...

  @Column()
  itemId: string; // provider item id (e.g. plaid item_id)

  @Column({ type: 'text' })
  encryptedToken: string;

  @Column({ nullable: true })
  refreshToken?: string; // encrypt if needed similarly

  @Column({ type: 'jsonb', default: {} })
  meta: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
