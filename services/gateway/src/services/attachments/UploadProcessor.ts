/**
 * Processeur d'upload des attachments
 * Gère la validation, le stockage physique et le chiffrement
 */

import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  getAttachmentType,
  getSizeLimit,
  type AttachmentMetadata,
} from '@meeshy/shared/types/attachment';
import type { EncryptionMode } from '@meeshy/shared/types/encryption';
import {
  AttachmentEncryptionService,
  getAttachmentEncryptionService,
} from '../AttachmentEncryptionService';
import { MetadataManager } from './MetadataManager';

export interface FileToUpload {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  size: number;
}

export interface UploadResult {
  id: string;
  messageId: string | null;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  fileUrl: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
  bitrate?: number;
  sampleRate?: number;
  codec?: string;
  channels?: number;
  metadata?: any;
  fps?: number;
  videoCodec?: string;
  pageCount?: number;
  lineCount?: number;
  uploadedBy: string;
  isAnonymous: boolean;
  createdAt: Date;
}

export interface EncryptedUploadResult extends UploadResult {
  encryptionMetadata: {
    encryptionKey: string;
    iv: string;
    authTag: string;
    hmac: string;
    originalSize: number;
    originalHash: string;
    mode: EncryptionMode;
    thumbnailIv?: string;
    thumbnailAuthTag?: string;
  };
}

/**
 * Processeur d'upload des attachments
 */
export class UploadProcessor {
  private prisma: PrismaClient;
  private uploadBasePath: string;
  private publicUrl: string;
  private encryptionService: AttachmentEncryptionService;
  private metadataManager: MetadataManager;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.encryptionService = getAttachmentEncryptionService(prisma);
    this.uploadBasePath = process.env.UPLOAD_PATH || path.join(process.cwd(), 'uploads', 'attachments');
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
      console.warn('[UploadProcessor] PUBLIC_URL non définie, utilisation du domaine par défaut:', url);
      return url;
    }

    if (isDevelopment) {
      if (process.env.BACKEND_URL) return process.env.BACKEND_URL;
      if (process.env.NEXT_PUBLIC_BACKEND_URL) return process.env.NEXT_PUBLIC_BACKEND_URL;

      const port = process.env.PORT || '3000';
      const url = `http://localhost:${port}`;
      console.warn('[UploadProcessor] BACKEND_URL non définie en développement, utilisation de localhost:', url);
      return url;
    }

    const fallback = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    console.error('[UploadProcessor] Impossible de déterminer PUBLIC_URL, utilisation du fallback:', fallback);
    return fallback;
  }

  /**
   * Valide un fichier selon son type et sa taille
   */
  validateFile(file: FileToUpload): { valid: boolean; error?: string } {
    const attachmentType = getAttachmentType(file.mimeType, file.filename);
    const sizeLimit = getSizeLimit(attachmentType);

    if (file.size > sizeLimit) {
      const limitGB = Math.floor(sizeLimit / (1024 * 1024 * 1024));
      return {
        valid: false,
        error: `Fichier trop volumineux. Taille max: ${limitGB}GB`
      };
    }

    return { valid: true };
  }

  /**
   * Génère un chemin de fichier structuré: YYYY/mm/userId/filename
   */
  generateFilePath(userId: string, originalFilename: string): string {
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');

    const ext = path.extname(originalFilename);
    const nameWithoutExt = path.basename(originalFilename, ext);
    const cleanName = nameWithoutExt.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    const uniqueName = `${cleanName}_${uuidv4()}${ext}`;

    return path.join(year, month, userId, uniqueName);
  }

  /**
   * Sauvegarde physiquement un fichier avec permissions sécurisées
   */
  async saveFile(buffer: Buffer, relativePath: string): Promise<void> {
    const fullPath = path.join(this.uploadBasePath, relativePath);
    const directory = path.dirname(fullPath);

    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(fullPath, buffer);

    try {
      await fs.chmod(fullPath, 0o644);
    } catch (error) {
      console.error('[UploadProcessor] Impossible de modifier les permissions du fichier:', error);
    }
  }

  /**
   * Génère une URL publique pour un fichier
   */
  getAttachmentUrl(filePath: string): string {
    return `${this.publicUrl}/api/v1/attachments/file/${encodeURIComponent(filePath)}`;
  }

  /**
   * Génère le chemin API relatif (sans domaine)
   */
  getAttachmentPath(filePath: string): string {
    return `/api/v1/attachments/file/${encodeURIComponent(filePath)}`;
  }

  /**
   * Construit l'URL complète à partir d'un chemin relatif
   */
  buildFullUrl(relativePath: string): string {
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
      return relativePath;
    }
    return `${this.publicUrl}${relativePath}`;
  }

  /**
   * Upload un fichier standard (non chiffré)
   */
  async uploadFile(
    file: FileToUpload,
    userId: string,
    isAnonymous: boolean = false,
    messageId?: string,
    providedMetadata?: any
  ): Promise<UploadResult> {
    console.log('📥 [UploadProcessor] uploadFile called:', {
      filename: file.filename,
      mimeType: file.mimeType,
      size: file.size,
    });

    const validation = this.validateFile(file);
    if (!validation.valid) {
      console.error('[UploadProcessor] Validation échouée:', validation.error);
      throw new Error(validation.error);
    }

    const filePath = this.generateFilePath(userId, file.filename);
    await this.saveFile(file.buffer, filePath);

    const attachmentType = getAttachmentType(file.mimeType, file.filename);
    const metadata = await this.metadataManager.extractMetadata(
      filePath,
      attachmentType,
      file.mimeType,
      providedMetadata
    );

    let thumbnailPath: string | null = null;
    if (attachmentType === 'image') {
      thumbnailPath = await this.metadataManager.generateThumbnail(filePath);
      metadata.thumbnailGenerated = !!thumbnailPath;
    }

    const fileUrl = this.getAttachmentPath(filePath);
    const thumbnailUrl = thumbnailPath ? this.getAttachmentPath(thumbnailPath) : undefined;
    const finalMessageId = messageId || null;

    const metadataJson = metadata.audioEffectsTimeline
      ? { audioEffectsTimeline: metadata.audioEffectsTimeline } as any
      : undefined;

    const attachment = await this.prisma.messageAttachment.create({
      data: {
        messageId: finalMessageId,
        fileName: path.basename(filePath),
        originalName: file.filename,
        mimeType: file.mimeType,
        fileSize: file.size,
        filePath: filePath,
        fileUrl: fileUrl,
        thumbnailPath: thumbnailPath || undefined,
        thumbnailUrl: thumbnailUrl,
        width: metadata.width,
        height: metadata.height,
        duration: metadata.duration,
        bitrate: metadata.bitrate,
        sampleRate: metadata.sampleRate,
        codec: metadata.codec,
        channels: metadata.channels,
        fps: metadata.fps,
        videoCodec: metadata.videoCodec,
        pageCount: metadata.pageCount,
        lineCount: metadata.lineCount,
        metadata: metadataJson,
        uploadedBy: userId,
        isAnonymous: isAnonymous,
      },
    });

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
      metadata: attachment.metadata || undefined,
      fps: attachment.fps || undefined,
      videoCodec: attachment.videoCodec || undefined,
      pageCount: attachment.pageCount || undefined,
      lineCount: attachment.lineCount || undefined,
      uploadedBy: attachment.uploadedBy,
      isAnonymous: attachment.isAnonymous,
      createdAt: attachment.createdAt,
    };
  }

  /**
   * Upload un fichier chiffré (E2EE)
   */
  async uploadEncryptedFile(
    file: FileToUpload,
    userId: string,
    encryptionMode: EncryptionMode,
    isAnonymous: boolean = false,
    messageId?: string,
    providedMetadata?: any
  ): Promise<EncryptedUploadResult> {
    console.log('🔐 [UploadProcessor] uploadEncryptedFile called:', {
      filename: file.filename,
      encryptionMode,
    });

    const validation = this.validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const attachmentType = getAttachmentType(file.mimeType, file.filename);

    let thumbnailBuffer: Buffer | undefined;
    if (attachmentType === 'image') {
      thumbnailBuffer = await this.metadataManager.generateThumbnailFromBuffer(file.buffer);
    }

    const encryptionResult = await this.encryptionService.encryptAttachment({
      fileBuffer: file.buffer,
      filename: file.filename,
      mimeType: file.mimeType,
      mode: encryptionMode,
      thumbnailBuffer,
    });

    const filePath = this.generateFilePath(userId, `${file.filename}.enc`);
    await this.saveFile(encryptionResult.encryptedBuffer, filePath);

    let thumbnailPath: string | undefined;
    if (encryptionResult.encryptedThumbnail) {
      const thumbPath = filePath.replace('.enc', '_thumb.enc');
      await this.saveFile(encryptionResult.encryptedThumbnail.buffer, thumbPath);
      thumbnailPath = thumbPath;
    }

    let serverCopyPath: string | undefined;
    if (encryptionResult.serverCopy && attachmentType === 'audio') {
      serverCopyPath = this.generateFilePath(userId, `${file.filename}.server.enc`);
      await this.saveFile(encryptionResult.serverCopy.encryptedBuffer, serverCopyPath);
    }

    const metadata: AttachmentMetadata = {};

    if (attachmentType === 'image') {
      const imageMeta = await this.metadataManager.extractImageMetadataFromBuffer(file.buffer);
      metadata.width = imageMeta.width;
      metadata.height = imageMeta.height;
    }

    if (attachmentType === 'audio' && providedMetadata) {
      metadata.duration = Math.round(providedMetadata.duration || 0);
      metadata.bitrate = providedMetadata.bitrate || 0;
      metadata.sampleRate = providedMetadata.sampleRate || 0;
      metadata.codec = providedMetadata.codec || 'unknown';
      metadata.channels = providedMetadata.channels || 1;
      if (providedMetadata.audioEffectsTimeline) {
        metadata.audioEffectsTimeline = providedMetadata.audioEffectsTimeline;
      }
    }

    const fileUrl = this.getAttachmentPath(filePath);
    const thumbnailUrl = thumbnailPath ? this.getAttachmentPath(thumbnailPath) : undefined;
    const serverCopyUrl = serverCopyPath ? this.getAttachmentPath(serverCopyPath) : undefined;

    const metadataJson = metadata.audioEffectsTimeline
      ? { audioEffectsTimeline: metadata.audioEffectsTimeline } as any
      : undefined;

    const attachment = await this.prisma.messageAttachment.create({
      data: {
        messageId: messageId || null,
        fileName: path.basename(filePath),
        originalName: file.filename,
        mimeType: file.mimeType,
        fileSize: encryptionResult.metadata.encryptedSize,
        filePath: filePath,
        fileUrl: fileUrl,
        thumbnailPath: thumbnailPath,
        thumbnailUrl: thumbnailUrl,
        width: metadata.width,
        height: metadata.height,
        duration: metadata.duration,
        bitrate: metadata.bitrate,
        sampleRate: metadata.sampleRate,
        codec: metadata.codec,
        channels: metadata.channels,
        metadata: metadataJson,
        uploadedBy: userId,
        isAnonymous: isAnonymous,
        isEncrypted: true,
        encryptionMode: encryptionMode,
        encryptionIv: encryptionResult.metadata.iv,
        encryptionAuthTag: encryptionResult.metadata.authTag,
        encryptionHmac: encryptionResult.metadata.hmac,
        originalFileHash: encryptionResult.metadata.originalHash,
        encryptedFileHash: encryptionResult.metadata.encryptedHash,
        originalFileSize: encryptionResult.metadata.originalSize,
        serverKeyId: encryptionResult.serverCopy?.keyId,
        thumbnailEncryptionIv: encryptionResult.encryptedThumbnail?.iv,
        thumbnailEncryptionAuthTag: encryptionResult.encryptedThumbnail?.authTag,
        serverCopyUrl: serverCopyUrl,
      },
    });

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
      metadata: attachment.metadata || undefined,
      uploadedBy: attachment.uploadedBy,
      isAnonymous: attachment.isAnonymous,
      createdAt: attachment.createdAt,
      encryptionMetadata: {
        encryptionKey: encryptionResult.metadata.encryptionKey,
        iv: encryptionResult.metadata.iv,
        authTag: encryptionResult.metadata.authTag,
        hmac: encryptionResult.metadata.hmac,
        originalSize: encryptionResult.metadata.originalSize,
        originalHash: encryptionResult.metadata.originalHash,
        mode: encryptionResult.metadata.mode,
        thumbnailIv: encryptionResult.encryptedThumbnail?.iv,
        thumbnailAuthTag: encryptionResult.encryptedThumbnail?.authTag,
      },
    };
  }

  /**
   * Upload multiple fichiers
   */
  async uploadMultiple(
    files: FileToUpload[],
    userId: string,
    isAnonymous: boolean = false,
    messageId?: string,
    metadataMap?: Map<number, any>
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const fileMetadata = metadataMap?.get(i);
        const result = await this.uploadFile(file, userId, isAnonymous, messageId, fileMetadata);
        results.push(result);
        console.log(`[UploadProcessor] Fichier uploadé: ${file.filename} (${(file.size / (1024 * 1024)).toFixed(1)}MB)`);
      } catch (error) {
        console.error('[UploadProcessor] Erreur upload fichier:', {
          filename: file.filename,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    console.log(`[UploadProcessor] Résultat upload: ${results.length}/${files.length} fichier(s) uploadé(s)`);
    return results;
  }

  /**
   * Crée un attachment depuis du texte
   */
  async createTextAttachment(
    content: string,
    userId: string,
    isAnonymous: boolean = false,
    messageId?: string
  ): Promise<UploadResult> {
    const filename = `text_${Date.now()}.txt`;
    const buffer = Buffer.from(content, 'utf-8');

    return this.uploadFile(
      {
        buffer,
        filename,
        mimeType: 'text/plain',
        size: buffer.length,
      },
      userId,
      isAnonymous,
      messageId
    );
  }
}
