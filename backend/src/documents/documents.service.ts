import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import * as clamav from 'clamav.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as sharp from 'sharp';

@Injectable()
export class DocumentsService {
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
    const file: Express.Multer.File = {
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
  validateFile(file: Express.Multer.File): boolean {
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
   * Store file in S3 (encrypted)
   */
  async storeInS3(
    fileId: string,
    encryptedBuffer: Buffer,
    mimetype: string,
  ): Promise<string> {
    // Configure your S3 bucket and region
    const bucketName = process.env.AWS_S3_BUCKET || 'your-bucket-name';
    const region = process.env.AWS_REGION || 'us-east-1';
    const s3 = new S3Client({ region });
    const key = `documents/${fileId}`;
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: encryptedBuffer,
      ContentType: mimetype,
      ServerSideEncryption: 'AES256', // S3 encryption at rest
    });
    try {
      await s3.send(putCommand);
      return `s3://${bucketName}/${key}`;
    } catch (err) {
      throw new Error('Failed to upload file to S3');
    }
  }

  /**
   * Generate thumbnail for images and upload to S3
   */
  async generateThumbnail(
    fileBuffer: Buffer,
    mimetype: string,
    fileId?: string,
  ): Promise<string | null> {
    if (mimetype === 'image/jpeg' || mimetype === 'image/png') {
      try {
        // Generate thumbnail (200x200px)
        const thumbnailBuffer = await sharp(fileBuffer)
          .resize(200, 200, { fit: 'cover' })
          .toBuffer();
        // Upload thumbnail to S3
        if (fileId) {
          const bucketName = process.env.AWS_S3_BUCKET || 'your-bucket-name';
          const region = process.env.AWS_REGION || 'us-east-1';
          const s3 = new S3Client({ region });
          const key = `thumbnails/${fileId}`;
          const putCommand = new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: thumbnailBuffer,
            ContentType: mimetype,
            ServerSideEncryption: 'AES256',
          });
          await s3.send(putCommand);
          return `s3://${bucketName}/${key}`;
        }
        return null;
      } catch (err) {
        // Thumbnail generation/upload failed
        return null;
      }
    }
    return null;
  }

  /**
   * Main upload handler (to be called from controller)
   */
  async handleUpload(
    file: Express.Multer.File,
  ): Promise<{ fileId: string; s3Url: string; thumbnailUrl?: string }> {
    if (!this.validateFile(file)) {
      throw new Error('Invalid file type or size');
    }
    const virusFree = await this.scanForViruses(file.buffer);
    if (!virusFree) {
      throw new Error('File failed virus scan');
    }
    const fileId = this.generateFileId();
    // Set initial progress
    this.setProgress(fileId, 10); // 10% after validation/virus scan
    await this.notifyWebhook(fileId, 10);
    const encryptedBuffer = this.encryptFile(file.buffer);
    this.setProgress(fileId, 30); // 30% after encryption
    await this.notifyWebhook(fileId, 30);
    const s3Url = await this.storeInS3(fileId, encryptedBuffer, file.mimetype);
    this.setProgress(fileId, 80); // 80% after S3 upload
    await this.notifyWebhook(fileId, 80);
    let thumbnailUrl: string | undefined = undefined;
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
      const url = await this.generateThumbnail(
        file.buffer,
        file.mimetype,
        fileId,
      );
      if (url) thumbnailUrl = url;
    }
    this.setProgress(fileId, 100); // 100% complete
    await this.notifyWebhook(fileId, 100);
    // TODO: Support batch/resume, send webhooks
    return { fileId, s3Url, thumbnailUrl };
  }
}
