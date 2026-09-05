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
  ACCEPTED_MIME_TYPES,
} from '@meeshy/shared/types/attachment';
import type { VoiceQualityAnalysis } from '@meeshy/shared/types/voice-api';
import type { EncryptionMode } from '@meeshy/shared/types/encryption';
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
import { attachmentServiceRowSelect } from './attachmentIncludes';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'AttachmentService' });

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
      logger.warn('PUBLIC_URL non définie, utilisation du domaine par défaut', { url });
      return url;
    }

    if (isDevelopment) {
      if (process.env.BACKEND_URL) return process.env.BACKEND_URL;
      if (process.env.NEXT_PUBLIC_BACKEND_URL) return process.env.NEXT_PUBLIC_BACKEND_URL;

      const port = process.env.PORT || '3000';
      const url = `http://localhost:${port}`;
      logger.warn('BACKEND_URL non définie, utilisation de localhost', { url });
      return url;
    }

    const fallback = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    logger.error('Impossible de déterminer PUBLIC_URL', { fallback });
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
    attachmentIds: readonly string[],
    messageId: string
  ): Promise<void> {
    await this.prisma.messageAttachment.updateMany({
      where: {
        id: { in: [...attachmentIds] },
      },
      data: {
        messageId: messageId,
      },
    });
  }

  private toAttachment(attachment: {
    id: string;
    messageId: string | null;
    fileName: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    fileUrl: string;
    thumbnailUrl: string | null;
    width: number | null;
    height: number | null;
    duration: number | null;
    bitrate: number | null;
    sampleRate: number | null;
    codec: string | null;
    channels: number | null;
    uploadedBy: string;
    isAnonymous: boolean;
    createdAt: Date;
    isForwarded: boolean | null;
    capturedInApp?: boolean | null;
    isViewOnce: boolean | null;
    viewOnceCount: number | null;
    isBlurred: boolean | null;
    viewedCount: number | null;
    downloadedCount: number | null;
    consumedCount: number | null;
    isEncrypted: boolean | null;
  }): Attachment {
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
      capturedInApp: attachment.capturedInApp ?? false,
      isViewOnce: attachment.isViewOnce ?? false,
      viewOnceCount: attachment.viewOnceCount ?? 0,
      isBlurred: attachment.isBlurred ?? false,
      viewedCount: attachment.viewedCount ?? 0,
      downloadedCount: attachment.downloadedCount ?? 0,
      consumedCount: attachment.consumedCount ?? 0,
      isEncrypted: attachment.isEncrypted ?? false,
    };
  }

  async getAttachment(attachmentId: string): Promise<Attachment | null> {
    // #4166, critère 1 — `findUnique` SANS `select` chargeait la ligne
    // ENTIÈRE (transcription, translations, encryptionIv…) pour n'en garder
    // que les 26 champs que `toAttachment` lit. `attachmentServiceRowSelect`
    // EST ce contrat, rendu explicite à la requête.
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: attachmentId },
      select: attachmentServiceRowSelect,
    });

    if (!attachment) {
      return null;
    }

    return this.toAttachment(attachment);
  }

  /**
   * Charge N pièces jointes en UNE requête, rendues dans l'ordre des ids
   * demandés (`null` pour un id introuvable, afin que l'appelant puisse
   * nommer l'index fautif).
   *
   * Le chemin d'envoi validait chaque pièce par un `findUnique` dans un
   * `Promise.all` : à 199 pièces (`MAX_ATTACHMENTS_PER_MESSAGE`), un seul
   * événement socket ouvrait 199 requêtes concurrentes vers MongoDB. Un
   * `findMany` rend le coût constant — un aller-retour, quel que soit le
   * nombre de pièces.
   *
   * Les doublons d'ids sont tolérés : chacun retrouve la même ligne.
   */
  async getAttachmentsByIds(attachmentIds: readonly string[]): Promise<Array<Attachment | null>> {
    if (attachmentIds.length === 0) {
      return [];
    }

    // Même contrat que `getAttachment` (#4166) : `toAttachment` ne lit que
    // `attachmentServiceRowSelect`, jamais la ligne entière.
    const rows = await this.prisma.messageAttachment.findMany({
      where: { id: { in: [...new Set(attachmentIds)] } },
      select: attachmentServiceRowSelect,
    });

    const byId = new Map(rows.map((row) => [row.id, this.toAttachment(row)]));
    return attachmentIds.map((id) => byId.get(id) ?? null);
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
        // #4923 — requis par la garde d'appartenance de la route (le
        // déposant d'une pièce PAS ENCORE rattachée à un message est le seul
        // à pouvoir la lire) ; déjà déclaré par `messageAttachmentSchema`
        // mais jamais chargé ici, donc jamais servi malgré le contrat.
        uploadedBy: true,
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

  /**
   * Supprime la LIGNE dans tous les cas ; n'efface les OCTETS que si plus
   * aucune autre ligne ne les désigne.
   *
   * Plusieurs `MessageAttachment` partagent délibérément le même fichier : le
   * transfert (`MessageProcessor.copyForwardedAttachments`) et la diffusion à
   * plusieurs destinataires (`messaging/copyAttachments.ts`) recopient
   * `filePath` / `thumbnailPath` à l'identique, sans dupliquer un octet. Un
   * `unlink` inconditionnel emportait donc la photo de TOUS les autres
   * destinataires — et celle de la conversation d'origine — dès qu'un seul
   * exemplaire éphémère expirait sous `ExpiredMessagesCleanupService`.
   *
   * L'ORDRE porte l'invariant : la ligne part d'abord, donc le compte qui suit
   * ne voit plus que les AUTRES — zéro veut dire « plus personne n'en dépend ».
   * Compter avant obligerait à s'exclure soi-même et, surtout, deux
   * suppressions concurrentes de deux copies se verraient mutuellement
   * vivantes : aucune n'effacerait, et le fichier deviendrait un orphelin
   * éternel que rien ne ramasse — `MaintenanceService` ne balaie que les LIGNES
   * sans message, jamais les fichiers.
   */
  async deleteAttachment(attachmentId: string): Promise<void> {
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      throw new Error('Attachment not found');
    }

    await this.prisma.messageAttachment.delete({
      where: { id: attachmentId },
    });

    await this.unlinkIfUnreferenced('filePath', attachment.filePath);

    if (attachment.thumbnailPath) {
      await this.unlinkIfUnreferenced('thumbnailPath', attachment.thumbnailPath);
    }
  }

  /**
   * Un échec — comptage ou effacement — laisse le fichier en place : perdre un
   * octet encore référencé est irréparable, en garder un orphelin ne l'est pas.
   */
  private async unlinkIfUnreferenced(
    column: 'filePath' | 'thumbnailPath',
    relativePath: string
  ): Promise<void> {
    const where: Prisma.MessageAttachmentWhereInput =
      column === 'filePath' ? { filePath: relativePath } : { thumbnailPath: relativePath };

    try {
      const stillReferenced = await this.prisma.messageAttachment.count({ where });

      if (stillReferenced > 0) {
        return;
      }

      await fs.unlink(path.join(this.uploadBasePath, relativePath));
    } catch (error) {
      logger.error('Erreur suppression fichiers', error as Error);
    }
  }

  /**
   * Les pièces jointes d'une conversation, telles que CE lecteur a le droit de
   * les voir.
   *
   * `messageFilter` porte les exclusions qui dépendent du lecteur — plancher de
   * lien de partage, masquage personnel. Le service ne les calcule pas : il ne
   * sait pas qui appelle. Il tient en revanche les deux invariants qui ne
   * dépendent de personne, et il les pose APRÈS le filtre de l'appelant pour
   * que celui-ci ne puisse qu'ajouter — sortir de la conversation demandée ou
   * ressusciter une tombstone reste inexprimable.
   *
   * Cette méthode lisait DEUX colonnes lourdes de plus — `transcription`
   * (texte + segments mot-à-mot) et `translations` (toutes les langues) — pour
   * chacune des 100 pièces d'une page, les mappait, et le sérialiseur de la
   * route les jetait : elles ne sont déclarées par aucun schéma de LISTE.
   * Travail mort en base, sans le moindre effet sur le fil (#4887, défaut 3 ;
   * mesuré par #4392, au sens de #4177). Le retrait s'est fait ICI, au
   * `select` — jamais par un élargissement du schéma servi : le DÉTAIL
   * (`getAttachmentWithMetadata`) reste le seul chemin vers ces deux colonnes.
   *
   * Le `select` et le mapper qui restaient sont, à la ligne près,
   * `attachmentServiceRowSelect` et `toAttachment` — la projection que #4166 a
   * établie pour `getAttachment` et `getAttachmentsByIds`. Deux copies d'une
   * même forme dérivent ; une seule ne peut pas. La méthode rend donc un
   * `Attachment`, comme ses deux sœurs.
   */
  async getConversationAttachments(
    conversationId: string,
    options: {
      type?: AttachmentType;
      limit?: number;
      offset?: number;
      messageFilter?: Prisma.MessageWhereInput;
    } = {}
  ): Promise<Attachment[]> {
    const where: Prisma.MessageAttachmentWhereInput = {
      message: {
        ...options.messageFilter,
        conversationId: conversationId,
        deletedAt: null,
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
      select: attachmentServiceRowSelect,
    });

    return attachments.map((att) => this.toAttachment(att));
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
      logger.warn('Hash verification failed', { attachmentId });
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
