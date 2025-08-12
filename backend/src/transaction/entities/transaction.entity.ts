import { BankAccount } from 'src/banking/entities/bank-account.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';

@Entity({ name: 'transactions' })
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  providerTransactionId: string; // external id from provider

  @ManyToOne(() => BankAccount)
  @JoinColumn({ name: 'bankAccountId' })
  bankAccount: BankAccount;

  @Column()
  bankAccountId: string;

  @Column({ type: 'date' })
  date: string;

  @Column('decimal', { precision: 18, scale: 2 })
  amount: number;

  @Column()
  currency: string;

  @Column({ nullable: true })
  merchantName?: string;

  @Column({ nullable: true })
  rawDescription?: string;

  @Column({ nullable: true })
  category?: string;

  @Column({ default: false })
  pending: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
