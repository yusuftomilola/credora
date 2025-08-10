import { Module } from '@nestjs/common';

import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentProcessing } from './entities/document-processing.entity';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { DocumentProcessingService } from './document-processing.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'document-processing',
    }),
    TypeOrmModule.forFeature([DocumentProcessing]),
  ],
  providers: [DocumentsService, DocumentProcessingService],
  controllers: [DocumentsController],
  exports: [DocumentsService, DocumentProcessingService],
})
export class DocumentsModule {}
