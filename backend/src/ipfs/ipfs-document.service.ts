import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IpfsDocument } from './entities/ipfs-document.entity';

@Injectable()
export class IpfsDocumentService {
  constructor(
    @InjectRepository(IpfsDocument)
    private readonly ipfsDocumentRepository: Repository<IpfsDocument>,
  ) {}

  async saveMetadata(filename: string, owner: string, ipfsHash: string): Promise<IpfsDocument> {
    const doc = this.ipfsDocumentRepository.create({ filename, owner, ipfsHash });
    return this.ipfsDocumentRepository.save(doc);
  }

  async findByHash(ipfsHash: string): Promise<IpfsDocument | null> {
    return this.ipfsDocumentRepository.findOne({ where: { ipfsHash } });
  }
}
