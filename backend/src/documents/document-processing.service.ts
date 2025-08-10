import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';

import { DocumentsService } from './documents.service';
import { DocumentProcessing, DocumentProcessingStatus } from './entities/document-processing.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as Tesseract from 'tesseract.js';


@Injectable()
@Processor('document-processing')
export class DocumentProcessingService {
  private readonly logger = new Logger(DocumentProcessingService.name);

  constructor(
    private readonly documentsService: DocumentsService,
    @InjectRepository(DocumentProcessing)
    private readonly documentProcessingRepository: Repository<DocumentProcessing>,
  ) {}


  @Process()
  async handleDocumentProcessing(job: Job<{ fileId: string; fileBuffer: Buffer; mimetype: string }>) {
    const { fileId, fileBuffer, mimetype } = job.data;
    let processing = await this.documentProcessingRepository.findOne({ where: { fileId } });
    if (!processing) return;
    try {
      processing.status = DocumentProcessingStatus.PROCESSING;
      await this.documentProcessingRepository.save(processing);

      // 1. OCR text extraction
      const ocrResult = await this.runOCR(fileBuffer);

      // 2. Document type classification (simple example)
      const documentType = this.classifyDocumentType(ocrResult);

      // 3. Data extraction from ID documents (stub)
      const extractedData = this.extractData(documentType, ocrResult);

      // 4. Authenticity checks (stub)
      const authenticityCheck = this.checkAuthenticity(fileBuffer, extractedData);

      // 5. Image quality validation (stub)
      const imageQuality = this.validateImageQuality(fileBuffer);

      // 6. Face matching for ID photos (stub)
      const faceMatch = await this.matchFace(fileBuffer, extractedData);

      // 7. Duplicate document detection (stub)
      const duplicateCheck = await this.checkDuplicate(extractedData);

      // 8. Update processing entity
      processing.ocrResult = ocrResult;
      processing.documentType = documentType;
      processing.extractedData = extractedData;
      processing.authenticityCheck = authenticityCheck;
      processing.imageQuality = imageQuality;
      processing.faceMatch = faceMatch;
      processing.duplicateCheck = duplicateCheck;
      processing.status = DocumentProcessingStatus.COMPLETED;
      processing.error = null;
      await this.documentProcessingRepository.save(processing);
    } catch (error) {
      this.logger.error(`Processing failed for fileId ${fileId}: ${error}`);
      processing.status = DocumentProcessingStatus.FAILED;
      processing.error = error?.message || error;
      processing.retryCount = (processing.retryCount || 0) + 1;
      await this.documentProcessingRepository.save(processing);
      // Retry logic: requeue if under max retries
      if (processing.retryCount < 3) {
        processing.status = DocumentProcessingStatus.RETRY;
        await this.documentProcessingRepository.save(processing);
        await job.queue.add(job.data, { attempts: 3 });
      }
    }
  }



  async runOCR(fileBuffer: Buffer): Promise<any> {
    // Use Tesseract.js for OCR
    const { data } = await Tesseract.recognize(fileBuffer, 'eng');
    return data;
  }

  classifyDocumentType(ocrResult: any): string {
    // Simple keyword-based classification
    const text = ocrResult?.text?.toLowerCase() || '';
    if (text.includes('passport')) return 'passport';
    if (text.includes('driver')) return 'driver_license';
    if (text.includes('identity') || text.includes('id card')) return 'id_card';
    return 'unknown';
  }

  extractData(documentType: string, ocrResult: any): any {
    // Stub: extract fields based on template
    // In production, use regex/template per document type
    return { rawText: ocrResult?.text };
  }

  checkAuthenticity(fileBuffer: Buffer, extractedData: any): any {
    // Stub: implement watermark/barcode/signature checks
    return { passed: true };
  }

  validateImageQuality(fileBuffer: Buffer): any {
    // Stub: check resolution, blur, glare, etc.
    return { quality: 'good' };
  }

  async matchFace(fileBuffer: Buffer, extractedData: any): Promise<any> {
    // Stub: use face-api.js or AWS Rekognition for face matching
    return { match: true };
  }

  async checkDuplicate(extractedData: any): Promise<any> {
    // Stub: search DB for duplicate extracted data
    return { duplicate: false };
  }

  // Add methods for OCR, classification, extraction, etc.
}
