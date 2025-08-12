import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class DataClassification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  entityType: string;

  @Column()
  entityId: string;

  @Column()
  classification: string;

  @CreateDateColumn()
  classifiedAt: Date;
}
