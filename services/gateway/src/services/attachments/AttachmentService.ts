/**
 * Service orchestrateur de gestion des attachements
 * Délègue à UploadProcessor et MetadataManager
 */

import { PrismaClient, Prisma } from '@meeshy/shared/prisma/client';
import { promises as fs } from 'fs';
import path from 'path';
import type {
  Attachment,
  AttachmentType,
  AttachmentWithMetadata,
  ACCEPTED_MIME_TYPES,
} from '@meeshy/shared/types/attachment';
import type { VoiceQualityAnalysis } from '@meeshy/shared/types/voice-api';
import type { EncryptionMode } from '@meeshy/shared/types/encryption';
import type {
  AttachmentTranscription,
  AttachmentTranslations,
} from '@meeshy/shared/types/attachment-audio';
import { toSocketIOAudios } from '@meeshy/shared/types/attachment-audio';
import {
  AttachmentEncryptionService,
  getAttachmentEncryptionService,
} from '../AttachmentEncryptionService';
import {
  UploadProcessor,
  type FileToUpload,
  type UploadResult,
  type EncryptedUploadResult,
} from './UploadProcessor';
import { MetadataManager } from './MetadataManager';

/**
 * Service principal de gestion des attachements
 * Orchestrateur qui coordonne l'upload, les métadonnées et le chiffrement
 */
export class AttachmentService {
  private prisma: PrismaClient;
  private uploadBasePath: string;
  private publicUrl: string;
  private encryptionService: AttachmentEncryptionService;
  private uploadProcessor: UploadProcessor;
  private metadataManager: MetadataManager;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.encryptionService = getAttachmentEncryptionService(prisma);
    // UPLOAD_PATH doit être défini dans Docker, fallback sécurisé vers /app/uploads
    this.uploadBasePath = process.env.UPLOAD_PATH || '/app/uploads';
    this.uploadProcessor = new UploadProcessor(prisma);
    this.metadataManager = new MetadataManager(this.uploadBasePath);
    this.publicUrl = this.determinePublicUrl();
  }

  /**
   * Détermine l'URL publique selon l'environnement
   */
  private determinePublicUrl(): string {
    const isProduction = process.env.NODE_ENV === 'production';
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'local';

    if (process.env.PUBLIC_URL) {
      return process.env.PUBLIC_URL;
    }

    if (isProduction) {
      const domain = process.env.DOMAIN || 'meeshy.me';
      const url = `https://gate.${domain}`;
      console.warn('[AttachmentService] PUBLIC_URL non définie, utilisation du domaine par défaut:', url);
      return url;
    }

    if (isDevelopment) {
      if (process.env.BACKEND_URL) return process.env.BACKEND_URL;
      if (process.env.NEXT_PUBLIC_BACKEND_URL) return process.env.NEXT_PUBLIC_BACKEND_URL;

      const port = process.env.PORT || '3000';
      const url = `http://localhost:${port}`;
      console.warn('[AttachmentService] BACKEND_URL non définie en développement, utilisation de localhost:', url);
      return url;
    }

    const fallback = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    console.error('[AttachmentService] Impossible de déterminer PUBLIC_URL, utilisation du fallback:', fallback);
    return fallback;
  }

  // ==================== DÉLÉGATION UPLOAD ====================

  validateFile(file: FileToUpload): { valid: boolean; error?: string } {
    return this.uploadProcessor.validateFile(file);
  }

  async uploadFile(
    file: FileToUpload,
    userId: string,
    isAnonymous: boolean = false,
    messageId?: string,
    providedMetadata?: any
  ): Promise<UploadResult> {
    return this.uploadProcessor.uploadFile(file, userId, isAnonymous, messageId, providedMetadata);
  }

  async uploadEncryptedFile(
    file: FileToUpload,
    userId: string,
    encryptionMode: EncryptionMode,
    isAnonymous: boolean = false,
    messageId?: string,
    providedMetadata?: any
  ): Promise<EncryptedUploadResult> {
    return this.uploadProcessor.uploadEncryptedFile(
      file,
      userId,
      encryptionMode,
      isAnonymous,
      messageId,
      providedMetadata
    );
  }

  async uploadMultiple(
    files: FileToUpload[],
    userId: string,
    isAnonymous: boolean = false,
    messageId?: string,
    metadataMap?: Map<number, any>
  ): Promise<UploadResult[]> {
    return this.uploadProcessor.uploadMultiple(files, userId, isAnonymous, messageId, metadataMap);
  }

  async createTextAttachment(
    content: string,
    userId: string,
    isAnonymous: boolean = false,
    messageId?: string
  ): Promise<UploadResult> {
    return this.uploadProcessor.createTextAttachment(content, userId, isAnonymous, messageId);
  }

  // ==================== URL HELPERS ====================

  getAttachmentUrl(filePath: string): string {
    return this.uploadProcessor.getAttachmentUrl(filePath);
  }

  getAttachmentPath(filePath: string): string {
    return this.uploadProcessor.getAttachmentPath(filePath);
  }

  buildFullUrl(relativePath: string): string {
    return this.uploadProcessor.buildFullUrl(relativePath);
  }

  // ==================== GESTION ATTACHMENTS ====================

  async associateAttachmentsToMessage(
    attachmentIds: string[],
    messageId: string
  ): Promise<void> {
    await this.prisma.messageAttachment.updateMany({
      where: {
        id: { in: attachmentIds },
      },
      data: {
        messageId: messageId,
      },
    });
  }

  async getAttachment(attachmentId: string): Promise<Attachment | null> {
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      return null;
    }

    return {
      id: attachment.id,
      messageId: attachment.messageId,
      fileName: attachment.fileName,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      fileUrl: attachment.fileUrl,
      thumbnailUrl: attachment.thumbnailUrl || undefined,
      width: attachment.width || undefined,
      height: attachment.height || undefined,
      duration: attachment.duration || undefined,
      bitrate: attachment.bitrate || undefined,
      sampleRate: attachment.sampleRate || undefined,
      codec: attachment.codec || undefined,
      channels: attachment.channels || undefined,
      uploadedBy: attachment.uploadedBy,
      isAnonymous: attachment.isAnonymous,
      createdAt: attachment.createdAt.toISOString(),
      isForwarded: attachment.isForwarded ?? false,
      isViewOnce: attachment.isViewOnce ?? false,
      viewOnceCount: attachment.viewOnceCount ?? 0,
      isBlurred: attachment.isBlurred ?? false,
      viewedCount: attachment.viewedCount ?? 0,
      downloadedCount: attachment.downloadedCount ?? 0,
      consumedCount: attachment.consumedCount ?? 0,
      isEncrypted: attachment.isEncrypted ?? false,
    };
  }

  async getAttachmentWithMetadata(attachmentId: string): Promise<any | null> {
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        id: true,
        messageId: true,
        fileName: true,
        fileUrl: true,
        filePath: true,
        mimeType: true,
        fileSize: true,
        duration: true,
        transcription: true,
        translations: true,
        metadata: true,
        createdAt: true,
      },
    });

    if (!attachment) {
      return null;
    }

    return attachment;
  }

  async getFilePath(attachmentId: string): Promise<string | null> {
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: attachmentId },
      select: { filePath: true },
    });

    if (!attachment) {
      return null;
    }

    return path.join(this.uploadBasePath, attachment.filePath);
  }

  async getThumbnailPath(attachmentId: string): Promise<string | null> {
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: attachmentId },
      select: { thumbnailPath: true },
    });

    if (!attachment || !attachment.thumbnailPath) {
      return null;
    }

    return path.join(this.uploadBasePath, attachment.thumbnailPath);
  }

  async deleteAttachment(attachmentId: string): Promise<void> {
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      throw new Error('Attachment not found');
    }

    try {
      const fullPath = path.join(this.uploadBasePath, attachment.filePath);
      await fs.unlink(fullPath);

      if (attachment.thumbnailPath) {
        const thumbnailFullPath = path.join(this.uploadBasePath, attachment.thumbnailPath);
        await fs.unlink(thumbnailFullPath).catch(() => {});
      }
    } catch (error) {
      console.error('[AttachmentService] Erreur suppression fichiers:', error);
    }

    await this.prisma.messageAttachment.delete({
      where: { id: attachmentId },
    });
  }

  async getConversationAttachments(
    conversationId: string,
    options: {
      type?: AttachmentType;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<AttachmentWithMetadata[]> {
    const where: Prisma.MessageAttachmentWhereInput = {
      message: {
        conversationId: conversationId,
      },
    };

    if (options.type) {
      const ACCEPTED_MIME_TYPES_IMPORT = await import('@meeshy/shared/types/attachment');
      const mimeTypes = ACCEPTED_MIME_TYPES_IMPORT.ACCEPTED_MIME_TYPES[
        options.type.toUpperCase() as keyof typeof ACCEPTED_MIME_TYPES_IMPORT.ACCEPTED_MIME_TYPES
      ] || [];
      where.mimeType = { in: [...mimeTypes] };
    }

    const attachments = await this.prisma.messageAttachment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options.limit || 50,
      skip: options.offset || 0,
      select: {
        id: true,
        messageId: true,
        fileName: true,
        originalName: true,
        mimeType: true,
        fileSize: true,
        fileUrl: true,
        thumbnailUrl: true,
        width: true,
        height: true,
        duration: true,
        bitrate: true,
        sampleRate: true,
        codec: true,
        channels: true,
        uploadedBy: true,
        isAnonymous: true,
        createdAt: true,
        isForwarded: true,
        isViewOnce: true,
        viewOnceCount: true,
        isBlurred: true,
        viewedCount: true,
        downloadedCount: true,
        consumedCount: true,
        isEncrypted: true,
        transcription: true,
        translations: true,
      }
    });

    return attachments.map((att) => ({
      id: att.id,
      messageId: att.messageId,
      fileName: att.fileName,
      originalName: att.originalName,
      mimeType: att.mimeType,
      fileSize: att.fileSize,
      fileUrl: att.fileUrl,
      thumbnailUrl: att.thumbnailUrl || undefined,
      width: att.width || undefined,
      height: att.height || undefined,
      duration: att.duration || undefined,
      bitrate: att.bitrate || undefined,
      sampleRate: att.sampleRate || undefined,
      codec: att.codec || undefined,
      channels: att.channels || undefined,
      uploadedBy: att.uploadedBy,
      isAnonymous: att.isAnonymous,
      createdAt: att.createdAt.toISOString(),
      isForwarded: att.isForwarded ?? false,
      isViewOnce: att.isViewOnce ?? false,
      viewOnceCount: att.viewOnceCount ?? 0,
      isBlurred: att.isBlurred ?? false,
      viewedCount: att.viewedCount ?? 0,
      downloadedCount: att.downloadedCount ?? 0,
      consumedCount: att.consumedCount ?? 0,
      isEncrypted: att.isEncrypted ?? false,
      transcription: att.transcription as unknown as AttachmentTranscription | null,
      translatedAudios: toSocketIOAudios(att.id, att.translations as unknown as AttachmentTranslations | undefined),
      translations: (att.translations as unknown as AttachmentTranslations | undefined) || {}
    }));
  }

  // ==================== CHIFFREMENT ====================

  async decryptAttachment(
    attachmentId: string,
    encryptionKey: string
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      throw new Error('Attachment not found');
    }

    if (!attachment.isEncrypted) {
      const fullPath = path.join(this.uploadBasePath, attachment.filePath);
      const buffer = await fs.readFile(fullPath);
      return {
        buffer,
        mimeType: attachment.mimeType,
        filename: attachment.originalName,
      };
    }

    const fullPath = path.join(this.uploadBasePath, attachment.filePath);
    const encryptedBuffer = await fs.readFile(fullPath);

    if (attachment.encryptionHmac) {
      const hmacValid = this.encryptionService.verifyHmac(
        encryptedBuffer,
        encryptionKey,
        attachment.encryptionHmac
      );
      if (!hmacValid) {
        throw new Error('HMAC verification failed - file may be corrupted');
      }
    }

    const decryptResult = await this.encryptionService.decryptAttachment({
      encryptedBuffer,
      encryptionKey,
      iv: attachment.encryptionIv!,
      authTag: attachment.encryptionAuthTag!,
      expectedHash: attachment.originalFileHash || undefined,
    });

    if (!decryptResult.hashVerified) {
      console.warn('[AttachmentService] Hash verification failed for attachment:', attachmentId);
    }

    return {
      buffer: decryptResult.decryptedBuffer,
      mimeType: attachment.mimeType,
      filename: attachment.originalName,
    };
  }

  async isAttachmentEncrypted(attachmentId: string): Promise<boolean> {
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: attachmentId },
      select: { isEncrypted: true },
    });
    return attachment?.isEncrypted ?? false;
  }
}

// Export types pour usage externe
export type { FileToUpload, UploadResult, EncryptedUploadResult };
