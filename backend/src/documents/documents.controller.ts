import {
  Controller,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  Body,
  Get,
  Param,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './documents.service';
import { DocumentUploadDto } from './dto/document-upload.dto';
import { multerConfig } from './multer.config';
import { Body as RawBody } from '@nestjs/common';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', multerConfig))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: DocumentUploadDto,
  ) {
    try {
      // TODO: Track upload progress and send webhook updates
      // TODO: Support resumable uploads (chunked/tus)
      const result = await this.documentsService.handleUpload(file);
      // TODO: Send webhook notification for upload completion
      return result;
    } catch (error) {
      // Return error details for validation/virus scan failures
      return { error: error.message };
    }
  }

  @Post('upload/batch')
  @UseInterceptors(FilesInterceptor('files', 10, multerConfig))
  async uploadFiles(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: DocumentUploadDto,
  ) {
    // TODO: Track batch upload progress and send webhook updates
    // TODO: Support resumable batch uploads
    const results = await Promise.all(
      files.map(async (file) => {
        try {
          return await this.documentsService.handleUpload(file);
        } catch (error) {
          return { error: error.message };
        }
      }),
    );
    // TODO: Send webhook notification for batch upload completion
    return results;
  }

  /**
   * Poll upload progress by fileId
   */
  @Get('progress/:fileId')
  getUploadProgress(@Param('fileId') fileId: string) {
    const percent = this.documentsService.getProgress(fileId);
    return { fileId, progress: percent };
  }

  /**
   * Register a webhook URL for upload progress notifications
   */
  @Post('webhook/:fileId')
  async registerWebhook(
    @Param('fileId') fileId: string,
    @RawBody() body: { url: string },
  ) {
    this.documentsService.setWebhook(fileId, body.url);
    return { fileId, webhook: body.url };
  }

  /**
   * Chunked upload endpoint for resumable uploads
   */
  @Post('upload/chunk')
  @UseInterceptors(FileInterceptor('chunk'))
  async uploadChunk(@UploadedFile() chunk, @Body() body) {
    await this.documentsService.saveChunk(
      body.fileId,
      body.chunkIndex,
      body.totalChunks,
      chunk.buffer,
    );
    return { fileId: body.fileId, chunkIndex: body.chunkIndex };
  }

  /**
   * Complete upload and assemble file from chunks
   */
  @Post('upload/complete')
  async completeUpload(@Body() body) {
    return await this.documentsService.assembleChunksAndProcess(
      body.fileId,
      body.mimetype,
    );
  }
}
