import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BankToken } from './bank-token.entity';

@Entity({ name: 'bank_accounts' })
export class BankAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  providerAccountId: string; // provider-specific account id

  @Column()
  name: string;

  @Column()
  mask?: string;

  @Column()
  type?: string;

  @Column()
  subtype?: string;

  @Column('decimal', { precision: 18, scale: 2, nullable: true })
  currentBalance?: number;

  @Column('decimal', { precision: 18, scale: 2, nullable: true })
  availableBalance?: number;

  @ManyToOne(() => BankToken)
  @JoinColumn({ name: 'bankTokenId' })
  bankToken: BankToken;

  @Column()
  bankTokenId: string;
}
