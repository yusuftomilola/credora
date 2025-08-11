  import { Express } from 'express';
import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentProcessing, DocumentProcessingStatus } from './entities/document-processing.entity';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import * as clamav from 'clamav.js';

import * as sharp from 'sharp';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectQueue('document-processing') private readonly documentProcessingQueue: Queue,
    @InjectRepository(DocumentProcessing)
    private readonly documentProcessingRepository: Repository<DocumentProcessing>,
  ) {}
  /**
   * Get all documents for a user
   */
  async getUserDocuments(userId: string) {
    return this.documentProcessingRepository.find({ where: { userId } });
  }

  /**
   * Delete all documents for a user (retention policy)
   */
  async deleteUserDocuments(userId: string) {
    const docs = await this.getUserDocuments(userId);
    for (const doc of docs) {
      await this.documentProcessingRepository.delete(doc.id);
    }
    return { status: 'deleted', userId };
  }
  // In-memory chunk storage: { [fileId]: Buffer[] }
  private chunkStorage: Record<string, Buffer[]> = {};
  /**
   * Save a chunk for a fileId
   */
  async saveChunk(
    fileId: string,
    chunkIndex: number,
    totalChunks: number,
    chunkBuffer: Buffer,
  ) {
    if (!this.chunkStorage[fileId]) {
      this.chunkStorage[fileId] = new Array(totalChunks).fill(null);
    }
    this.chunkStorage[fileId][chunkIndex] = chunkBuffer;
    // Optionally, update progress
    const received = this.chunkStorage[fileId].filter(Boolean).length;
    const percent = Math.floor((received / totalChunks) * 100);
    this.setProgress(fileId, percent);
    await this.notifyWebhook(fileId, percent);
  }

  /**
   * Get document processing status and results by fileId
   */
  async getProcessingStatus(fileId: string) {
    return this.documentProcessingRepository.findOne({ where: { fileId } });
  }


  /**
   * Assemble chunks and process as a complete file
   */
  async assembleChunksAndProcess(fileId: string, mimetype: string) {
    const chunks = this.chunkStorage[fileId];
    if (!chunks || chunks.some((c) => !c)) {
      throw new Error('Missing chunks');
    }
    const fileBuffer = Buffer.concat(chunks);
    // Clean up chunk storage
    delete this.chunkStorage[fileId];
    // Create a mock Multer file object
    const file: MulterFile = {
      buffer: fileBuffer,
      mimetype,
      size: fileBuffer.length,
      fieldname: 'file',
      originalname: `${fileId}`,
      encoding: '7bit',
      destination: '',
      filename: `${fileId}`,

      path: '',
      stream: null as any,
    };
    return await this.handleUpload(file);
  }
  // In-memory webhook tracker: { [fileId]: url }
  private webhooks: Record<string, string> = {};
  /**
   * Set webhook URL for a fileId
   */
  setWebhook(fileId: string, url: string) {
    this.webhooks[fileId] = url;
  }

  /**
   * Notify webhook with progress
   */
  async notifyWebhook(fileId: string, progress: number) {
    const url = this.webhooks[fileId];
    if (!url) return;
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, progress }),
      });
    } catch (err) {
      // Ignore webhook errors for now
    }
  }
  // In-memory progress tracker: { [fileId]: percent }
  private uploadProgress: Record<string, number> = {};
  /**
   * Set upload progress (0-100)
   */
  setProgress(fileId: string, percent: number) {
    this.uploadProgress[fileId] = percent;
  }

  /**
   * Get upload progress (0-100)
   */
  getProgress(fileId: string): number {
    return this.uploadProgress[fileId] ?? 0;
  }
  // File type whitelist
  private readonly allowedMimeTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
  ];

  // Max file size: 10MB
  private readonly maxFileSize = 10 * 1024 * 1024;

  /**
   * Validate file type and size
   */
  validateFile(file: MulterFile): boolean {
    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      return false;
    }
    if (file.size > this.maxFileSize) {
      return false;
    }
    return true;
  }

  /**
   * Generate a unique file identifier
   */
  generateFileId(): string {
    return uuidv4();
  }

  /**
   * Scan file for viruses using ClamAV
   */
  async scanForViruses(fileBuffer: Buffer): Promise<boolean> {
    // Default ClamAV daemon port
    const clamavPort = 3310;
    const clamavHost = '127.0.0.1'; // Update if ClamAV runs elsewhere
    return new Promise((resolve, reject) => {
      clamav.ping(clamavPort, clamavHost, (pingErr: any) => {
        if (pingErr) {
          // ClamAV not available
          return reject(new Error('ClamAV service unavailable'));
        }
        clamav.scanBuffer(
          fileBuffer,
          clamavPort,
          clamavHost,
          (err: any, object: any, malicious: boolean) => {
            if (err) {
              return reject(new Error('Error scanning file for viruses'));
            }
            if (malicious) {
              return resolve(false);
            }
            return resolve(true);
          },
        );
      });
    });
  }

  /**
   * Encrypt file before storing
   * TODO: Use proper encryption key management
   */
  encryptFile(fileBuffer: Buffer): Buffer {
    // Example: AES-256 encryption (replace with secure key management)
    const key = crypto.randomBytes(32); // TODO: Use a persistent key
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(fileBuffer);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    // TODO: Store key/iv securely
    return encrypted;
  }





  /**
   * Main upload handler (to be called from controller)
   */
  async handleUpload(
    file: MulterFile,
  ): Promise<{ fileId: string }> {
    if (!this.validateFile(file)) {
      throw new Error('Invalid file type or size');
    }
    // Remove virus scan, encryption, S3, and thumbnail logic for in-memory processing
    const fileId = this.generateFileId();
    this.setProgress(fileId, 10);
    await this.notifyWebhook(fileId, 10);
    // Create DocumentProcessing entity for status tracking
    const processing = this.documentProcessingRepository.create({
      fileId,
      status: DocumentProcessingStatus.QUEUED,
    });
    await this.documentProcessingRepository.save(processing);
    // Enqueue Bull job for background processing (pass buffer and mimetype)
    await this.documentProcessingQueue.add({ fileId, fileBuffer: file.buffer, mimetype: file.mimetype });
    this.setProgress(fileId, 100);
    await this.notifyWebhook(fileId, 100);
    return { fileId };
  }
}

// Local MulterFile type for upload handling
type MulterFile = {
  buffer: Buffer;
  mimetype: string;
  size: number;
  fieldname: string;
  originalname: string;
  encoding: string;
  destination: string;
  filename: string;
  path: string;
  stream: any;
};
