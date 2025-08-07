import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  fullName: string;

  @Index()
  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ default: true })
  isActive: boolean;
}
