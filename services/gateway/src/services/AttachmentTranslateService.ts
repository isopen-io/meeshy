/**
 * AttachmentTranslateService - Dispatcher for attachment translation
 *
 * Routes translation requests to the appropriate service based on attachment type:
 * - audio/* → AudioTranslateService
 * - image/* → ImageTranslateService (stub)
 * - video/* → VideoTranslateService (stub)
 * - application/pdf, text/* → DocumentTranslateService (stub)
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import { promises as fs } from 'fs';
import path from 'path';
import { AudioTranslateService, AudioTranslationResult } from './AudioTranslateService';
import { ZMQTranslationClient } from './ZmqTranslationClient';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface TranslateOptions {
  targetLanguages: string[];
  sourceLanguage?: string;
  generateVoiceClone?: boolean;
  async?: boolean;
  webhookUrl?: string;
  priority?: number;
}

export interface AsyncJobSubmitResult {
  jobId: string;
  status: string;
}

export interface TranslationResult {
  type: 'audio' | 'image' | 'video' | 'document';
  attachmentId: string;
  result: AudioTranslationResult | AsyncJobSubmitResult | ImageTranslationResult | VideoTranslationResult | DocumentTranslationResult;
}

export interface ImageTranslationResult {
  translationId: string;
  originalText: string;
  translations: Array<{
    targetLanguage: string;
    translatedText: string;
    overlayImageUrl?: string;
  }>;
}

export interface VideoTranslationResult {
  translationId: string;
  jobId?: string;
  status: string;
}

export interface DocumentTranslationResult {
  translationId: string;
  originalText: string;
  translations: Array<{
    targetLanguage: string;
    translatedText: string;
    translatedDocumentUrl?: string;
  }>;
}

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class AttachmentTranslateService {
  private prisma: PrismaClient;
  private audioTranslateService: AudioTranslateService;
  private uploadBasePath: string;

  constructor(prisma: PrismaClient, zmqClient: ZMQTranslationClient) {
    this.prisma = prisma;
    this.audioTranslateService = new AudioTranslateService(zmqClient);
    this.uploadBasePath = process.env.UPLOAD_PATH || path.join(process.cwd(), 'uploads', 'attachments');
  }

  /**
   * Translate an attachment based on its type
   */
  async translate(
    userId: string,
    attachmentId: string,
    options: TranslateOptions
  ): Promise<ServiceResult<TranslationResult>> {
    try {
      // 1. Get attachment from database
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        include: {
          message: {
            select: {
              conversationId: true,
              senderId: true
            }
          }
        }
      });

      if (!attachment) {
        return {
          success: false,
          error: 'Attachment not found',
          errorCode: 'ATTACHMENT_NOT_FOUND'
        };
      }

      // 2. Verify user has access to this attachment
      const hasAccess = await this.verifyUserAccess(userId, attachment);
      if (!hasAccess) {
        return {
          success: false,
          error: 'Access denied to this attachment',
          errorCode: 'ACCESS_DENIED'
        };
      }

      // 3. Determine attachment type and route to appropriate service
      const attachmentType = this.getAttachmentType(attachment.mimeType);

      switch (attachmentType) {
        case 'audio':
          return await this.translateAudio(userId, attachment, options);

        case 'image':
          return await this.translateImage(userId, attachment, options);

        case 'video':
          return await this.translateVideo(userId, attachment, options);

        case 'document':
          return await this.translateDocument(userId, attachment, options);

        default:
          return {
            success: false,
            error: `Unsupported attachment type: ${attachment.mimeType}`,
            errorCode: 'UNSUPPORTED_TYPE'
          };
      }
    } catch (error) {
      console.error('[AttachmentTranslateService] Translation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Translation failed',
        errorCode: 'TRANSLATION_FAILED'
      };
    }
  }

  /**
   * Get translation status for async jobs
   */
  async getTranslationStatus(
    userId: string,
    jobId: string
  ): Promise<ServiceResult<{ status: string; progress?: number; result?: any }>> {
    // Delegate to audio service for now (only audio supports async)
    return this.audioTranslateService.getJobStatus(userId, jobId);
  }

  /**
   * Cancel a translation job
   */
  async cancelTranslation(
    userId: string,
    jobId: string
  ): Promise<ServiceResult<{ cancelled: boolean }>> {
    return this.audioTranslateService.cancelJob(userId, jobId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  private getAttachmentType(mimeType: string): 'audio' | 'image' | 'video' | 'document' | 'unknown' {
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType === 'application/pdf' || mimeType.startsWith('text/')) return 'document';
    return 'unknown';
  }

  private async verifyUserAccess(userId: string, attachment: any): Promise<boolean> {
    // User uploaded the attachment
    if (attachment.uploadedBy === userId) {
      return true;
    }

    // User is part of the conversation
    if (attachment.message?.conversationId) {
      const member = await this.prisma.conversationMember.findFirst({
        where: {
          conversationId: attachment.message.conversationId,
          userId: userId,
          isActive: true
        }
      });
      return !!member;
    }

    return false;
  }

  private async readAttachmentFile(filePath: string): Promise<Buffer> {
    const fullPath = path.join(this.uploadBasePath, filePath);
    return fs.readFile(fullPath);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TYPE-SPECIFIC TRANSLATION METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  private async translateAudio(
    userId: string,
    attachment: any,
    options: TranslateOptions
  ): Promise<ServiceResult<TranslationResult>> {
    // Read audio file
    const audioBuffer = await this.readAttachmentFile(attachment.filePath);
    const audioBase64 = audioBuffer.toString('base64');

    // Translate via AudioTranslateService
    const result = options.async
      ? await this.audioTranslateService.translateAsync(userId, {
          audioBase64,
          targetLanguages: options.targetLanguages,
          sourceLanguage: options.sourceLanguage,
          generateVoiceClone: options.generateVoiceClone,
          webhookUrl: options.webhookUrl,
          priority: options.priority
        })
      : await this.audioTranslateService.translateSync(userId, {
          audioBase64,
          targetLanguages: options.targetLanguages,
          sourceLanguage: options.sourceLanguage,
          generateVoiceClone: options.generateVoiceClone
        });

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        errorCode: result.errorCode
      };
    }

    return {
      success: true,
      data: {
        type: 'audio',
        attachmentId: attachment.id,
        result: result.data!
      }
    };
  }

  private async translateImage(
    userId: string,
    attachment: any,
    options: TranslateOptions
  ): Promise<ServiceResult<TranslationResult>> {
    // STUB: Image translation not yet implemented
    return {
      success: false,
      error: 'Image translation not yet implemented',
      errorCode: 'NOT_IMPLEMENTED'
    };
  }

  private async translateVideo(
    userId: string,
    attachment: any,
    options: TranslateOptions
  ): Promise<ServiceResult<TranslationResult>> {
    // STUB: Video translation not yet implemented
    return {
      success: false,
      error: 'Video translation not yet implemented',
      errorCode: 'NOT_IMPLEMENTED'
    };
  }

  private async translateDocument(
    userId: string,
    attachment: any,
    options: TranslateOptions
  ): Promise<ServiceResult<TranslationResult>> {
    // STUB: Document translation not yet implemented
    return {
      success: false,
      error: 'Document translation not yet implemented',
      errorCode: 'NOT_IMPLEMENTED'
    };
  }
}
