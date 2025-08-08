import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('ipfs_documents')
export class IpfsDocument {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  filename: string;

  @Column()
  owner: string;

  @Column()
  ipfsHash: string;

  @CreateDateColumn()
  createdAt: Date;
}
