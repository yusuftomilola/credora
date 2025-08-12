import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class Consent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  purpose: string;

  @Column({ default: true })
  granted: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
