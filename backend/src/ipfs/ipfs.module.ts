import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IpfsService } from './ipfs.service';
import { IpfsDocumentService } from './ipfs-document.service';
import { IpfsDocument } from './entities/ipfs-document.entity';

@Module({
  imports: [TypeOrmModule.forFeature([IpfsDocument])],
  providers: [IpfsService, IpfsDocumentService],
  exports: [IpfsService, IpfsDocumentService],
})
export class IpfsModule {}
