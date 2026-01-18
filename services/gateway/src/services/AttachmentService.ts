/**
 * Service de gestion des attachements de messages
 * Gère l'upload, le stockage, les miniatures et la suppression de fichiers
 *
 * Supports encrypted attachments for DMA-compliant E2EE conversations:
 * - 'e2ee': Full end-to-end encryption (server stores encrypted blobs only)
 * - 'server': Server-side encryption (server can decrypt for translation)
 * - 'hybrid': Double encryption (E2EE + server layer for audio translation)
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { parseFile } from 'music-metadata';
import { PDFParse } from 'pdf-parse';
import * as ffmpeg from 'fluent-ffmpeg';
import {
  Attachment,
  AttachmentType,
  AttachmentMetadata,
  getAttachmentType,
  getSizeLimit,
  UPLOAD_LIMITS,
  ACCEPTED_MIME_TYPES
} from '@meeshy/shared/types/attachment';
import {
  AttachmentEncryptionService,
  getAttachmentEncryptionService,
  type EncryptAttachmentOptions,
} from './AttachmentEncryptionService';
import type { EncryptionMode } from '@meeshy/shared/types/encryption';

export interface FileToUpload {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  size: number;
}

export interface AudioMetadata {
  duration: number;
  bitrate: number;
  sampleRate: number;
  codec: string;
  channels: number;
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
  metadata?: any; // Métadonnées JSON (contient audioEffectsTimeline pour les audios)
  fps?: number;
  videoCodec?: string;
  pageCount?: number;
  lineCount?: number;
  uploadedBy: string;
  isAnonymous: boolean;
  createdAt: Date;
}

export class AttachmentService {
  private prisma: PrismaClient;
  private uploadBasePath: string;
  private publicUrl: string;
  private thumbnailSize = 300; // Taille des miniatures en pixels
  private encryptionService: AttachmentEncryptionService;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.encryptionService = getAttachmentEncryptionService(prisma);
    this.uploadBasePath = process.env.UPLOAD_PATH || path.join(process.cwd(), 'uploads', 'attachments');
    
    // Détection intelligente de l'URL publique selon l'environnement
    const isProduction = process.env.NODE_ENV === 'production';
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'local';

    // Déterminer l'URL publique avec une logique plus robuste
    if (process.env.PUBLIC_URL) {
      // 1. Priorité absolue à PUBLIC_URL si définie explicitement
      this.publicUrl = process.env.PUBLIC_URL;
    } else if (isProduction) {
      // 2. En production, construire l'URL à partir du domaine
      const domain = process.env.DOMAIN || 'meeshy.me';
      this.publicUrl = `https://gate.${domain}`;
      console.warn('[AttachmentService] ⚠️  PUBLIC_URL non définie, utilisation du domaine par défaut:', this.publicUrl);
    } else if (isDevelopment) {
      // 3. En développement, utiliser BACKEND_URL ou dériver du port
      // Priorité: BACKEND_URL > NEXT_PUBLIC_BACKEND_URL > localhost avec PORT
      if (process.env.BACKEND_URL) {
        this.publicUrl = process.env.BACKEND_URL;
      } else if (process.env.NEXT_PUBLIC_BACKEND_URL) {
        this.publicUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      } else {
        // Fallback avec le port du serveur actuel
        const port = process.env.PORT || '3000';
        this.publicUrl = `http://localhost:${port}`;
        console.warn('[AttachmentService] ⚠️  BACKEND_URL non définie en développement, utilisation de localhost:', this.publicUrl);
      }
    } else {
      // 4. Fallback ultime - utiliser les variables d'environnement disponibles
      this.publicUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
      console.error('[AttachmentService] ❌ Impossible de déterminer PUBLIC_URL, utilisation du fallback:', this.publicUrl);
    }
    
    
    // Validation en production
    if (isProduction && this.publicUrl.includes('localhost')) {
      console.error('[AttachmentService] ❌ ERREUR CRITIQUE: PUBLIC_URL pointe vers localhost en production!');
      console.error('[AttachmentService] Veuillez définir PUBLIC_URL=https://gate.meeshy.me dans le fichier .env');
    }
  }

  /**
   * Valide un fichier selon son type et sa taille
   */
  validateFile(file: FileToUpload): { valid: boolean; error?: string } {
    // Accepter tous les types de fichiers - pas de restriction MIME
    // Passer le filename pour la détection par extension (important pour .sh, .c, .graphql, etc.)
    const attachmentType = getAttachmentType(file.mimeType, file.filename);

    // Vérifier la taille (2GB max)
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
    
    // Nettoyer le nom de fichier original
    const ext = path.extname(originalFilename);
    const nameWithoutExt = path.basename(originalFilename, ext);
    const cleanName = nameWithoutExt.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    
    // Générer un nom unique avec UUID
    const uniqueName = `${cleanName}_${uuidv4()}${ext}`;
    
    return path.join(year, month, userId, uniqueName);
  }

  /**
   * Sauvegarde physiquement un fichier
   * SÉCURITÉ: Retire automatiquement les droits d'exécution pour éviter
   * l'exécution de code malveillant uploadé
   */
  async saveFile(buffer: Buffer, relativePath: string): Promise<void> {
    const fullPath = path.join(this.uploadBasePath, relativePath);
    const directory = path.dirname(fullPath);

    // Créer les répertoires si nécessaire
    await fs.mkdir(directory, { recursive: true });

    // Écrire le fichier
    await fs.writeFile(fullPath, buffer);

    // SÉCURITÉ: Retirer tous les droits d'exécution (chmod 644)
    // - Propriétaire: lecture + écriture (rw-)
    // - Groupe: lecture seulement (r--)
    // - Autres: lecture seulement (r--)
    // Mode 0o644 = rw-r--r-- (pas d'exécution pour personne)
    try {
      await fs.chmod(fullPath, 0o644);
    } catch (error) {
      console.error('[AttachmentService] ⚠️ Impossible de modifier les permissions du fichier:', error);
      // Ne pas bloquer l'upload si chmod échoue (peut échouer sur certains systèmes de fichiers)
    }
  }

  /**
   * Génère une miniature pour une image
   */
  async generateThumbnail(imagePath: string): Promise<string | null> {
    try {
      const fullPath = path.join(this.uploadBasePath, imagePath);
      const ext = path.extname(imagePath);
      const thumbnailPath = imagePath.replace(ext, `_thumb${ext}`);
      const fullThumbnailPath = path.join(this.uploadBasePath, thumbnailPath);

      // Générer la miniature avec Sharp
      await sharp(fullPath)
        .resize(this.thumbnailSize, this.thumbnailSize, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toFile(fullThumbnailPath);

      return thumbnailPath;
    } catch (error) {
      console.error('[AttachmentService] Erreur génération miniature:', error);
      return null;
    }
  }

  /**
   * Extrait les métadonnées d'une image
   */
  async extractImageMetadata(imagePath: string): Promise<{ width: number; height: number }> {
    try {
      const fullPath = path.join(this.uploadBasePath, imagePath);
      const metadata = await sharp(fullPath).metadata();
      return {
        width: metadata.width || 0,
        height: metadata.height || 0,
      };
    } catch (error) {
      console.error('[AttachmentService] Erreur extraction métadonnées image:', error);
      return { width: 0, height: 0 };
    }
  }

  /**
   * Extrait les métadonnées d'un fichier audio
   * Supporte WebM, MP4, OGG, MP3, WAV, etc.
   */
  async extractAudioMetadata(audioPath: string): Promise<AudioMetadata> {
    try {
      const fullPath = path.join(this.uploadBasePath, audioPath);
      const metadata = await parseFile(fullPath);

      const format = metadata.format;

      // Extraction des métadonnées audio
      const audioMetadata: AudioMetadata = {
        duration: Math.round(format.duration || 0), // Durée en secondes (arrondie)
        bitrate: format.bitrate || 0, // Débit en bps
        sampleRate: format.sampleRate || 0, // Fréquence d'échantillonnage
        codec: format.codec || format.codecProfile || 'unknown', // Codec détecté
        channels: format.numberOfChannels || 1, // Nombre de canaux (mono=1, stereo=2)
      };


      return audioMetadata;
    } catch (error) {
      console.error('[AttachmentService] Erreur extraction métadonnées audio:', {
        filePath: audioPath,
        error: error instanceof Error ? error.message : error,
      });

      // Retourner des valeurs par défaut en cas d'erreur
      return {
        duration: 0,
        bitrate: 0,
        sampleRate: 0,
        codec: 'unknown',
        channels: 1,
      };
    }
  }

  /**
   * Extrait les métadonnées d'un fichier PDF
   * Retourne le nombre de pages
   */
  async extractPdfMetadata(pdfPath: string): Promise<{ pageCount: number }> {
    try {
      const fullPath = path.join(this.uploadBasePath, pdfPath);
      const dataBuffer = await fs.readFile(fullPath);
      const parser = new PDFParse({ data: dataBuffer });
      const result = await parser.getInfo();
      await parser.destroy();

      return {
        pageCount: result.total || 0,
      };
    } catch (error) {
      console.error('[AttachmentService] Erreur extraction métadonnées PDF:', {
        filePath: pdfPath,
        error: error instanceof Error ? error.message : error,
      });

      return {
        pageCount: 0,
      };
    }
  }

  /**
   * Extrait les métadonnées d'un fichier vidéo
   * Retourne durée, dimensions, fps, codec, bitrate
   */
  async extractVideoMetadata(videoPath: string): Promise<{
    duration: number;
    width: number;
    height: number;
    fps: number;
    videoCodec: string;
    bitrate: number;
  }> {
    const fullPath = path.join(this.uploadBasePath, videoPath);

    return new Promise((resolve, reject) => {
      // Timeout de 30 secondes pour éviter les blocages sur gros fichiers
      const timeout = setTimeout(() => {
        console.warn('[AttachmentService] ⚠️ Timeout ffprobe pour:', videoPath);
        reject(new Error('ffprobe timeout after 30 seconds'));
      }, 30000);

      ffmpeg.ffprobe(fullPath, (err, metadata) => {
        clearTimeout(timeout);

        if (err) {
          // Propager l'erreur pour que l'appelant puisse la gérer
          reject(err);
          return;
        }

        const videoStream = metadata.streams?.find((s) => s.codec_type === 'video');

        if (!videoStream) {
          // Pas de stream vidéo trouvé, retourner des valeurs par défaut
          resolve({
            duration: 0,
            width: 0,
            height: 0,
            fps: 0,
            videoCodec: 'unknown',
            bitrate: 0,
          });
          return;
        }

        // Calculer le FPS
        let fps = 0;
        if (videoStream.r_frame_rate) {
          const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
          fps = den ? num / den : 0;
        }

        resolve({
          duration: Math.round(metadata.format?.duration || 0),
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          fps: Math.round(fps * 100) / 100, // Arrondir à 2 décimales
          videoCodec: videoStream.codec_name || 'unknown',
          bitrate: parseInt(String(metadata.format?.bit_rate || 0), 10),
        });
      });
    });
  }

  /**
   * Compte le nombre de lignes dans un fichier texte/code
   */
  async extractTextMetadata(textPath: string): Promise<{ lineCount: number }> {
    try {
      const fullPath = path.join(this.uploadBasePath, textPath);
      const content = await fs.readFile(fullPath, 'utf-8');

      // Compter le nombre de lignes (séparer par \n)
      const lines = content.split('\n').length;

      return {
        lineCount: lines,
      };
    } catch (error) {
      console.error('[AttachmentService] Erreur extraction métadonnées texte:', {
        filePath: textPath,
        error: error instanceof Error ? error.message : error,
      });

      return {
        lineCount: 0,
      };
    }
  }

  /**
   * Génère une URL publique pour un fichier
   * Note: Utilise /api/v1/ pour correspondre au préfixe API du gateway
   */
  getAttachmentUrl(filePath: string): string {
    return `${this.publicUrl}/api/v1/attachments/file/${encodeURIComponent(filePath)}`;
  }

  /**
   * Génère uniquement le chemin API relatif (sans domaine)
   * Utilisé pour le stockage en DB - permet de changer le domaine sans migration
   * Note: Utilise /api/v1/ pour correspondre au préfixe API du gateway
   */
  getAttachmentPath(filePath: string): string {
    return `/api/v1/attachments/file/${encodeURIComponent(filePath)}`;
  }

  /**
   * Construit l'URL complète à partir d'un chemin relatif
   * Utilisé lors de la récupération depuis la DB
   */
  buildFullUrl(relativePath: string): string {
    // Si c'est déjà une URL complète (anciennes données), la retourner telle quelle
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
      return relativePath;
    }
    // Sinon, construire l'URL complète avec le domaine actuel
    return `${this.publicUrl}${relativePath}`;
  }

  /**
   * Upload un seul fichier
   */
  async uploadFile(
    file: FileToUpload,
    userId: string,
    isAnonymous: boolean = false,
    messageId?: string,
    providedMetadata?: any
  ): Promise<UploadResult> {

    console.log('📥 [AttachmentService] uploadFile called:', {
      filename: file.filename,
      mimeType: file.mimeType,
      size: file.size,
      hasProvidedMetadata: !!providedMetadata,
      providedMetadata: providedMetadata
    });

    // Valider le fichier
    const validation = this.validateFile(file);
    if (!validation.valid) {
      console.error('[AttachmentService] ❌ Validation échouée:', validation.error);
      throw new Error(validation.error);
    }

    // Générer le chemin
    const filePath = this.generateFilePath(userId, file.filename);
    
    // Sauvegarder le fichier
    await this.saveFile(file.buffer, filePath);

    // Déterminer le type (passer le filename pour détection par extension)
    const attachmentType = getAttachmentType(file.mimeType, file.filename);

    // Préparer les métadonnées
    const metadata: AttachmentMetadata = {};
    let thumbnailPath: string | null = null;

    // Si c'est une image, générer miniature et extraire métadonnées
    if (attachmentType === 'image') {
      const imageMeta = await this.extractImageMetadata(filePath);
      metadata.width = imageMeta.width;
      metadata.height = imageMeta.height;

      thumbnailPath = await this.generateThumbnail(filePath);
      metadata.thumbnailGenerated = !!thumbnailPath;
    }

    // Si c'est un fichier audio, extraire les métadonnées audio complètes
    if (attachmentType === 'audio') {
      console.log('🎵 [AttachmentService] Processing audio file:', {
        hasProvidedMetadata: !!providedMetadata,
        providedDuration: providedMetadata?.duration,
        providedMetadata: providedMetadata
      });

      // Utiliser les métadonnées fournies par le frontend si disponibles (Web Audio API)
      // Sinon, extraire avec music-metadata (peut échouer sur WebM mal encodé)
      if (providedMetadata && providedMetadata.duration !== undefined) {
        metadata.duration = Math.round(providedMetadata.duration);
        metadata.bitrate = providedMetadata.bitrate || 0;
        metadata.sampleRate = providedMetadata.sampleRate || 0;
        metadata.codec = providedMetadata.codec || 'unknown';
        metadata.channels = providedMetadata.channels || 1;

        console.log('✅ [AttachmentService] Using provided audio metadata:', {
          duration: metadata.duration,
          bitrate: metadata.bitrate,
          sampleRate: metadata.sampleRate,
          codec: metadata.codec
        });

        // Si audioEffectsTimeline est fourni, le stocker dans les métadonnées
        if (providedMetadata.audioEffectsTimeline) {
          console.log('🎬 [AttachmentService] audioEffectsTimeline found in providedMetadata:', {
            hasEvents: !!providedMetadata.audioEffectsTimeline.events,
            eventsCount: providedMetadata.audioEffectsTimeline.events?.length || 0,
            timeline: providedMetadata.audioEffectsTimeline
          });
          metadata.audioEffectsTimeline = providedMetadata.audioEffectsTimeline;
        } else {
          console.log('⚠️ [AttachmentService] No audioEffectsTimeline in providedMetadata');
        }
      } else {
        const audioMeta = await this.extractAudioMetadata(filePath);
        metadata.duration = audioMeta.duration;
        metadata.bitrate = audioMeta.bitrate;
        metadata.sampleRate = audioMeta.sampleRate;
        metadata.codec = audioMeta.codec;
        metadata.channels = audioMeta.channels;
      }
    }

    // Si c'est une vidéo, extraire les métadonnées vidéo complètes
    if (attachmentType === 'video') {
      try {
        const videoMeta = await this.extractVideoMetadata(filePath);
        metadata.duration = videoMeta.duration;
        metadata.width = videoMeta.width;
        metadata.height = videoMeta.height;
        metadata.fps = videoMeta.fps;
        metadata.videoCodec = videoMeta.videoCodec; // Stocker dans videoCodec pour les vidéos
        metadata.bitrate = videoMeta.bitrate;
      } catch (error) {
        // Si ffprobe n'est pas disponible, continuer sans métadonnées vidéo
        console.warn('[AttachmentService] ⚠️ Impossible d\'extraire métadonnées vidéo, upload continue:',
          error instanceof Error ? error.message : error);
        metadata.duration = 0;
        metadata.width = 0;
        metadata.height = 0;
        metadata.fps = 0;
        metadata.videoCodec = 'unknown';
        metadata.bitrate = 0;
      }
    }

    // Si c'est un PDF, extraire le nombre de pages
    if (attachmentType === 'document' && file.mimeType === 'application/pdf') {
      const pdfMeta = await this.extractPdfMetadata(filePath);
      metadata.pageCount = pdfMeta.pageCount;
    }

    // Si c'est du texte ou du code, compter le nombre de lignes
    if (attachmentType === 'text' || attachmentType === 'code') {
      const textMeta = await this.extractTextMetadata(filePath);
      metadata.lineCount = textMeta.lineCount;
    }

    // Générer les chemins API relatifs (sans domaine) pour stockage en DB
    // Cela permet de changer le domaine sans migration de données
    const fileUrl = this.getAttachmentPath(filePath);
    const thumbnailUrl = thumbnailPath ? this.getAttachmentPath(thumbnailPath) : undefined;

    // messageId est nullable - on utilise null si non fourni
    // L'attachment sera associé au message plus tard via associateAttachmentsToMessage()
    const finalMessageId = messageId || null;

    // Préparer le champ metadata pour stocker audioEffectsTimeline et autres métadonnées supplémentaires
    const metadataJson = metadata.audioEffectsTimeline
      ? { audioEffectsTimeline: metadata.audioEffectsTimeline } as any
      : undefined;

    console.log('💾 [AttachmentService] Preparing to save to database:', {
      hasMetadataJson: !!metadataJson,
      metadataJson: metadataJson,
      hasAudioEffectsTimeline: !!metadata.audioEffectsTimeline,
      duration: metadata.duration,
      attachmentType: attachmentType
    });

    // Créer l'enregistrement en base de données
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
        metadata: metadataJson, // Stocker audioEffectsTimeline dans le champ metadata JSON
        uploadedBy: userId,
        isAnonymous: isAnonymous,
      },
    });

    console.log('✅ [AttachmentService] Attachment saved to database:', {
      attachmentId: attachment.id,
      hasMetadataField: !!attachment.metadata,
      metadataField: attachment.metadata
    });

    console.log('📤 [AttachmentService] Preparing response with metadata:', {
      hasMetadata: !!attachment.metadata,
      metadata: attachment.metadata,
      hasAudioEffectsTimeline: !!(attachment.metadata as any)?.audioEffectsTimeline,
      audioEffectsTimelineEvents: (attachment.metadata as any)?.audioEffectsTimeline?.events?.length || 0
    });

    const result = {
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
      metadata: attachment.metadata || undefined, // ✅ Retourner metadata (contient audioEffectsTimeline)
      fps: attachment.fps || undefined,
      videoCodec: attachment.videoCodec || undefined,
      pageCount: attachment.pageCount || undefined,
      lineCount: attachment.lineCount || undefined,
      uploadedBy: attachment.uploadedBy,
      isAnonymous: attachment.isAnonymous,
      createdAt: attachment.createdAt,
    };

    console.log('🎯 [AttachmentService] Returning result:', {
      attachmentId: result.id,
      hasMetadata: !!result.metadata,
      hasAudioEffectsTimelineInMetadata: !!(result.metadata as any)?.audioEffectsTimeline,
      audioEffectsTimelineEvents: (result.metadata as any)?.audioEffectsTimeline?.events?.length || 0
    });

    return result;
  }

  // =====================================================
  // ENCRYPTED ATTACHMENT METHODS (DMA E2EE Support)
  // =====================================================

  /**
   * Upload an encrypted attachment
   *
   * Implements the WhatsApp/Signal "encrypt-then-upload" pattern:
   * 1. Generate per-attachment AES-256 key
   * 2. Encrypt file with AES-256-GCM
   * 3. Upload encrypted blob to storage
   * 4. Return encryption key (to be sent via E2EE message channel)
   *
   * @param file File to upload
   * @param userId User ID
   * @param encryptionMode Encryption mode ('e2ee', 'server', 'hybrid')
   * @param isAnonymous Whether user is anonymous
   * @param messageId Optional message ID
   * @param providedMetadata Optional metadata from frontend
   * @returns Upload result with encryption metadata
   */
  async uploadEncryptedFile(
    file: FileToUpload,
    userId: string,
    encryptionMode: EncryptionMode,
    isAnonymous: boolean = false,
    messageId?: string,
    providedMetadata?: any
  ): Promise<UploadResult & { encryptionMetadata: any }> {
    console.log('🔐 [AttachmentService] uploadEncryptedFile called:', {
      filename: file.filename,
      mimeType: file.mimeType,
      size: file.size,
      encryptionMode,
    });

    // Validate the file
    const validation = this.validateFile(file);
    if (!validation.valid) {
      console.error('[AttachmentService] ❌ Validation failed:', validation.error);
      throw new Error(validation.error);
    }

    // Determine attachment type
    const attachmentType = getAttachmentType(file.mimeType, file.filename);

    // Generate thumbnail for images (will be encrypted too)
    let thumbnailBuffer: Buffer | undefined;
    if (attachmentType === 'image') {
      try {
        thumbnailBuffer = await sharp(file.buffer)
          .resize(this.thumbnailSize, this.thumbnailSize, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 80 })
          .toBuffer();
      } catch (error) {
        console.warn('[AttachmentService] ⚠️ Could not generate thumbnail for encryption');
      }
    }

    // Encrypt the attachment
    const encryptionResult = await this.encryptionService.encryptAttachment({
      fileBuffer: file.buffer,
      filename: file.filename,
      mimeType: file.mimeType,
      mode: encryptionMode,
      thumbnailBuffer,
    });

    console.log('🔐 [AttachmentService] File encrypted:', {
      originalSize: encryptionResult.metadata.originalSize,
      encryptedSize: encryptionResult.metadata.encryptedSize,
      mode: encryptionResult.metadata.mode,
      hasServerCopy: !!encryptionResult.serverCopy,
    });

    // Generate file path for encrypted blob
    const filePath = this.generateFilePath(userId, `${file.filename}.enc`);

    // Save encrypted blob
    await this.saveFile(encryptionResult.encryptedBuffer, filePath);

    // Save encrypted thumbnail if generated
    let thumbnailPath: string | undefined;
    if (encryptionResult.encryptedThumbnail) {
      const thumbPath = filePath.replace('.enc', '_thumb.enc');
      await this.saveFile(encryptionResult.encryptedThumbnail.buffer, thumbPath);
      thumbnailPath = thumbPath;
    }

    // Save server copy for hybrid mode (for audio translation)
    let serverCopyPath: string | undefined;
    if (encryptionResult.serverCopy && attachmentType === 'audio') {
      serverCopyPath = this.generateFilePath(userId, `${file.filename}.server.enc`);
      await this.saveFile(encryptionResult.serverCopy.encryptedBuffer, serverCopyPath);
    }

    // Prepare metadata (extract from original unencrypted file before encryption)
    const metadata: AttachmentMetadata = {};

    if (attachmentType === 'image') {
      try {
        const imageMeta = await sharp(file.buffer).metadata();
        metadata.width = imageMeta.width || 0;
        metadata.height = imageMeta.height || 0;
      } catch {
        metadata.width = 0;
        metadata.height = 0;
      }
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

    // Generate URLs (relative paths for DB storage)
    const fileUrl = this.getAttachmentPath(filePath);
    const thumbnailUrl = thumbnailPath ? this.getAttachmentPath(thumbnailPath) : undefined;
    const serverCopyUrl = serverCopyPath ? this.getAttachmentPath(serverCopyPath) : undefined;

    // messageId est nullable - on utilise null si non fourni
    const finalMessageId = messageId || null;

    // Prepare metadata JSON
    const metadataJson = metadata.audioEffectsTimeline
      ? { audioEffectsTimeline: metadata.audioEffectsTimeline } as any
      : undefined;

    // Create database record with encryption fields
    const attachment = await this.prisma.messageAttachment.create({
      data: {
        messageId: finalMessageId,
        fileName: path.basename(filePath),
        originalName: file.filename,
        mimeType: file.mimeType,
        fileSize: encryptionResult.metadata.encryptedSize, // Store encrypted size
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
        // Encryption fields
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

    console.log('✅ [AttachmentService] Encrypted attachment saved:', {
      attachmentId: attachment.id,
      isEncrypted: attachment.isEncrypted,
      encryptionMode: attachment.encryptionMode,
      hasServerCopy: !!serverCopyUrl,
    });

    // Build result
    const result = {
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
      // Encryption metadata to be sent via E2EE message channel
      encryptionMetadata: {
        encryptionKey: encryptionResult.metadata.encryptionKey, // IMPORTANT: Send via E2EE only!
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

    return result;
  }

  /**
   * Decrypt an attachment for download
   *
   * @param attachmentId Attachment ID
   * @param encryptionKey Encryption key (from E2EE message)
   * @returns Decrypted file buffer
   */
  async decryptAttachment(
    attachmentId: string,
    encryptionKey: string
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    // Get attachment record
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      throw new Error('Attachment not found');
    }

    if (!attachment.isEncrypted) {
      // Not encrypted, return file directly
      const fullPath = path.join(this.uploadBasePath, attachment.filePath);
      const buffer = await fs.readFile(fullPath);
      return {
        buffer,
        mimeType: attachment.mimeType,
        filename: attachment.originalName,
      };
    }

    // Read encrypted file
    const fullPath = path.join(this.uploadBasePath, attachment.filePath);
    const encryptedBuffer = await fs.readFile(fullPath);

    // Verify HMAC first
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

    // Decrypt
    const decryptResult = await this.encryptionService.decryptAttachment({
      encryptedBuffer,
      encryptionKey,
      iv: attachment.encryptionIv!,
      authTag: attachment.encryptionAuthTag!,
      expectedHash: attachment.originalFileHash || undefined,
    });

    if (!decryptResult.hashVerified) {
      console.warn('[AttachmentService] ⚠️ Hash verification failed for attachment:', attachmentId);
    }

    return {
      buffer: decryptResult.decryptedBuffer,
      mimeType: attachment.mimeType,
      filename: attachment.originalName,
    };
  }

  /**
   * Decrypt server-side encrypted attachment (for audio translation in hybrid mode)
   *
   * @param attachmentId Attachment ID
   * @returns Decrypted file buffer
   */
  async decryptServerAttachment(attachmentId: string): Promise<Buffer> {
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      throw new Error('Attachment not found');
    }

    if (!attachment.serverCopyUrl || !attachment.serverKeyId) {
      throw new Error('No server copy available for this attachment');
    }

    // Construct path from URL
    const serverCopyPath = attachment.serverCopyUrl.replace('/attachments/', '');
    const fullPath = path.join(this.uploadBasePath, serverCopyPath);

    // Read encrypted server copy
    const encryptedBuffer = await fs.readFile(fullPath);

    // We need to get IV and authTag from somewhere - they should be stored
    // For now, this is a simplified implementation
    // In production, you'd store server IV/authTag separately or derive them
    throw new Error('Server attachment decryption requires additional implementation');
  }

  /**
   * Check if attachment is encrypted
   */
  async isAttachmentEncrypted(attachmentId: string): Promise<boolean> {
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: attachmentId },
      select: { isEncrypted: true },
    });
    return attachment?.isEncrypted ?? false;
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
        console.log(`[AttachmentService] ✅ Fichier uploadé avec succès: ${file.filename} (${(file.size / (1024 * 1024)).toFixed(1)}MB)`);
      } catch (error) {
        console.error('[AttachmentService] ❌ Erreur upload fichier:', {
          filename: file.filename,
          size: `${(file.size / (1024 * 1024)).toFixed(1)}MB`,
          error: error instanceof Error ? error.message : error,
        });
        // Ne pas ajouter le fichier aux résultats si l'upload a échoué
        // L'erreur sera propagée au client via le tableau results (taille réduite)
      }
    }

    console.log(`[AttachmentService] 📊 Résultat upload: ${results.length}/${files.length} fichier(s) uploadé(s)`);

    return results;
  }

  /**
   * Associe des attachments à un message
   */
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

  /**
   * Récupère un attachment par son ID
   */
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
      // Required fields with defaults
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

  /**
   * Récupère un attachment avec toutes ses métadonnées (transcription, traductions, analyses)
   * Inclut les relations Prisma: transcription et translatedAudios
   */
  async getAttachmentWithMetadata(attachmentId: string): Promise<any | null> {
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        transcription: true, // Inclut MessageAudioTranscription avec voiceQualityAnalysis
        translatedAudios: true, // Inclut MessageTranslatedAudio[]
      },
    });

    if (!attachment) {
      return null;
    }

    // Retourner l'objet complet avec toutes les relations
    return attachment;
  }

  /**
   * Récupère le chemin physique d'un fichier
   */
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

  /**
   * Récupère le chemin physique d'une miniature
   */
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
   * Supprime un attachment
   */
  async deleteAttachment(attachmentId: string): Promise<void> {
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      throw new Error('Attachment not found');
    }

    // Supprimer les fichiers physiques
    try {
      const fullPath = path.join(this.uploadBasePath, attachment.filePath);
      await fs.unlink(fullPath);

      // Supprimer la miniature si elle existe
      if (attachment.thumbnailPath) {
        const thumbnailFullPath = path.join(this.uploadBasePath, attachment.thumbnailPath);
        await fs.unlink(thumbnailFullPath).catch(() => {});
      }
    } catch (error) {
      console.error('[AttachmentService] Erreur suppression fichiers:', error);
    }

    // Supprimer de la base de données
    await this.prisma.messageAttachment.delete({
      where: { id: attachmentId },
    });
  }

  /**
   * Récupère tous les attachments d'une conversation
   */
  async getConversationAttachments(
    conversationId: string,
    options: {
      type?: AttachmentType;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Attachment[]> {
    const where: any = {
      message: {
        conversationId: conversationId,
      },
    };

    // Filtrer par type si spécifié
    if (options.type) {
      const mimeTypes = ACCEPTED_MIME_TYPES[options.type.toUpperCase() as keyof typeof ACCEPTED_MIME_TYPES] || [];
      where.mimeType = { in: mimeTypes };
    }

    const attachments = await this.prisma.messageAttachment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options.limit || 50,
      skip: options.offset || 0,
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
      // Required fields with defaults
      isForwarded: att.isForwarded ?? false,
      isViewOnce: att.isViewOnce ?? false,
      viewOnceCount: att.viewOnceCount ?? 0,
      isBlurred: att.isBlurred ?? false,
      viewedCount: att.viewedCount ?? 0,
      downloadedCount: att.downloadedCount ?? 0,
      consumedCount: att.consumedCount ?? 0,
      isEncrypted: att.isEncrypted ?? false,
    }));
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

