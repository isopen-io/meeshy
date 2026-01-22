/**
 * Gestionnaire de métadonnées des attachments
 * Extrait et gère les métadonnées spécifiques à chaque type de fichier
 */

import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { parseFile } from 'music-metadata';
import { PDFParse } from 'pdf-parse';
import * as ffmpeg from 'fluent-ffmpeg';
import type { AttachmentMetadata } from '@meeshy/shared/types/attachment';
import { enhancedLogger } from '../../utils/logger-enhanced';

// Logger dédié pour MetadataManager
const logger = enhancedLogger.child({ module: 'MetadataManager' });


export interface AudioMetadata {
  duration: number;      // En millisecondes
  bitrate: number;       // En bits/sec
  sampleRate: number;    // En Hz
  codec: string;
  channels: number;
}

export interface VideoMetadata {
  duration: number;      // En millisecondes
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  bitrate: number;       // En bits/sec
}

export interface ImageMetadata {
  width: number;
  height: number;
}

export interface PdfMetadata {
  pageCount: number;
}

export interface TextMetadata {
  lineCount: number;
}

/**
 * Gestionnaire de métadonnées des attachments
 */
export class MetadataManager {
  private uploadBasePath: string;
  private thumbnailSize: number = 300;

  constructor(uploadBasePath: string) {
    this.uploadBasePath = uploadBasePath;
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

      await sharp(fullPath)
        .resize(this.thumbnailSize, this.thumbnailSize, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toFile(fullThumbnailPath);

      return thumbnailPath;
    } catch (error) {
      logger.error('[MetadataManager] Erreur génération miniature', error);
      return null;
    }
  }

  /**
   * Génère une miniature à partir d'un buffer (pour fichiers chiffrés)
   */
  async generateThumbnailFromBuffer(buffer: Buffer): Promise<Buffer | undefined> {
    try {
      return await sharp(buffer)
        .resize(this.thumbnailSize, this.thumbnailSize, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch (error) {
      logger.warn('[MetadataManager] Could not generate thumbnail from buffer:', error);
      return undefined;
    }
  }

  /**
   * Extrait les métadonnées d'une image
   */
  async extractImageMetadata(imagePath: string): Promise<ImageMetadata> {
    try {
      const fullPath = path.join(this.uploadBasePath, imagePath);
      const metadata = await sharp(fullPath).metadata();
      return {
        width: metadata.width || 0,
        height: metadata.height || 0,
      };
    } catch (error) {
      logger.error('[MetadataManager] Erreur extraction métadonnées image', error);
      return { width: 0, height: 0 };
    }
  }

  /**
   * Extrait les métadonnées d'une image depuis un buffer
   */
  async extractImageMetadataFromBuffer(buffer: Buffer): Promise<ImageMetadata> {
    try {
      const metadata = await sharp(buffer).metadata();
      return {
        width: metadata.width || 0,
        height: metadata.height || 0,
      };
    } catch (error) {
      logger.error('[MetadataManager] Erreur extraction métadonnées image depuis buffer', error);
      return { width: 0, height: 0 };
    }
  }

  /**
   * Extrait les métadonnées audio avec ffprobe (fallback pour formats non supportés par music-metadata)
   * Utilisé pour M4A, AAC, et autres formats problématiques
   */
  private async extractAudioWithFfprobe(fullPath: string): Promise<AudioMetadata | null> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        logger.warn('[MetadataManager] Timeout ffprobe après 10 secondes');
        resolve(null);
      }, 10000);

      ffmpeg.ffprobe(fullPath, (err, metadata) => {
        clearTimeout(timeout);

        if (err) {
          logger.warn('[MetadataManager] ffprobe error:', err);
          resolve(null);
          return;
        }

        const audioStream = metadata.streams?.find((s) => s.codec_type === 'audio');

        if (!audioStream) {
          logger.warn('[MetadataManager] No audio stream found in file');
          resolve(null);
          return;
        }

        const duration = Math.round((metadata.format?.duration || 0) * 1000); // Secondes -> millisecondes
        const bitrate = parseInt(String(metadata.format?.bit_rate || audioStream.bit_rate || 0), 10);
        const sampleRate = audioStream.sample_rate || 0;
        const codec = audioStream.codec_name || 'unknown';
        const channels = audioStream.channels || 1;

        logger.info('📊 [MetadataManager] ffprobe extraction:', {
          duration,
          durationSeconds: duration / 1000,
          bitrate,
          sampleRate,
          codec,
          channels
        });

        resolve({
          duration,
          bitrate,
          sampleRate,
          codec,
          channels
        });
      });
    });
  }

  /**
   * Calcule la durée d'un fichier WAV à partir de son header
   * Format WAV: Header RIFF (12 bytes) + fmt chunk (24 bytes) + data chunk header (8 bytes)
   */
  async calculateWavDuration(fullPath: string, fileSize: number): Promise<AudioMetadata | null> {
    try {
      const fd = await fs.open(fullPath, 'r');
      const headerBuffer = Buffer.alloc(44);
      await fd.read(headerBuffer, 0, 44, 0);
      await fd.close();

      // Vérifier signature RIFF
      const riffSignature = headerBuffer.toString('ascii', 0, 4);
      const waveSignature = headerBuffer.toString('ascii', 8, 12);

      if (riffSignature !== 'RIFF' || waveSignature !== 'WAVE') {
        return null;
      }

      // Lire les informations du chunk fmt
      const audioFormat = headerBuffer.readUInt16LE(20);
      const channels = headerBuffer.readUInt16LE(22);
      const sampleRate = headerBuffer.readUInt32LE(24);
      const byteRate = headerBuffer.readUInt32LE(28);
      const bitsPerSample = headerBuffer.readUInt16LE(34);

      // Calculer la taille des données audio (taille totale - header)
      const dataSize = fileSize - 44;

      // Calculer la durée: dataSize / byteRate (en secondes, puis convertir en ms)
      const durationSeconds = byteRate > 0 ? dataSize / byteRate : 0;
      const duration = Math.round(durationSeconds * 1000); // Convertir en millisecondes

      logger.info('📊 [MetadataManager] WAV header analysis:', {
        audioFormat,
        channels,
        sampleRate,
        byteRate,
        bitsPerSample,
        dataSize,
        durationMs: duration,
        durationSeconds: durationSeconds,
        fileSize
      });

      return {
        duration,
        bitrate: byteRate * 8,
        sampleRate,
        codec: audioFormat === 1 ? 'pcm' : `wav_format_${audioFormat}`,
        channels,
      };
    } catch (error) {
      logger.error('[MetadataManager] Erreur lecture header WAV', error);
      return null;
    }
  }

  /**
   * Valide la cohérence entre durée et taille de fichier
   * Détecte les incohérences (ex: 1 seconde ne peut pas peser 50MB)
   * @param duration Durée en millisecondes
   * @param fileSize Taille du fichier en bytes
   * @param bitrate Bitrate en bits/sec
   * @param mimeType Type MIME du fichier
   */
  validateAudioCoherence(
    duration: number,
    fileSize: number,
    bitrate: number,
    mimeType: string
  ): { isValid: boolean; reason?: string; estimatedDuration?: number } {
    if (duration <= 0 || fileSize <= 0) {
      return { isValid: false, reason: 'Durée ou taille invalide' };
    }

    // Calculer le bitrate moyen réel (en bits/sec)
    // duration est en ms, donc on divise par 1000 pour avoir des secondes
    const durationSeconds = duration / 1000;
    const actualBitrate = (fileSize * 8) / durationSeconds;

    // Bitrates typiques par format (en bits/sec)
    const expectedBitrates: Record<string, { min: number; max: number }> = {
      'audio/wav': { min: 128_000, max: 2_304_000 },      // 16kHz mono 8-bit à 48kHz stereo 24-bit
      'audio/wave': { min: 128_000, max: 2_304_000 },
      'audio/x-wav': { min: 128_000, max: 2_304_000 },
      'audio/mp3': { min: 32_000, max: 320_000 },         // MP3 standard
      'audio/mpeg': { min: 32_000, max: 320_000 },
      'audio/ogg': { min: 45_000, max: 500_000 },         // OGG Vorbis
      'audio/opus': { min: 6_000, max: 510_000 },         // Opus
      'audio/webm': { min: 24_000, max: 510_000 },        // WebM (Opus/Vorbis)
      'audio/aac': { min: 32_000, max: 256_000 },         // AAC
      'audio/m4a': { min: 32_000, max: 256_000 },
      'audio/mp4': { min: 32_000, max: 256_000 },
    };

    const expected = expectedBitrates[mimeType] || { min: 8_000, max: 5_000_000 };

    // Vérifier si le bitrate réel est cohérent
    if (actualBitrate < expected.min * 0.5) {
      // Bitrate trop faible: durée probablement trop longue
      const estimatedDurationSeconds = (fileSize * 8) / expected.min;
      const estimatedDuration = Math.round(estimatedDurationSeconds * 1000); // Convertir en ms
      logger.warn('⚠️ [MetadataManager] Bitrate trop faible détecté:', {
        durationMs: duration,
        durationSeconds: durationSeconds,
        fileSize,
        actualBitrate: Math.round(actualBitrate),
        expectedMin: expected.min,
        estimatedDurationMs: estimatedDuration,
        mimeType
      });
      return {
        isValid: false,
        reason: 'Bitrate trop faible',
        estimatedDuration
      };
    }

    if (actualBitrate > expected.max * 2) {
      // Bitrate trop élevé: durée probablement trop courte ou fichier corrompu
      const estimatedDurationSeconds = (fileSize * 8) / expected.max;
      const estimatedDuration = Math.round(estimatedDurationSeconds * 1000); // Convertir en ms
      logger.warn('⚠️ [MetadataManager] Bitrate trop élevé détecté:', {
        durationMs: duration,
        durationSeconds: durationSeconds,
        actualBitrate: Math.round(actualBitrate),
        expectedMax: expected.max,
        estimatedDurationMs: estimatedDuration,
        mimeType
      });
      return {
        isValid: false,
        reason: 'Bitrate trop élevé',
        estimatedDuration
      };
    }

    return { isValid: true };
  }

  /**
   * Extrait les métadonnées d'un fichier audio
   * Supporte WebM, MP4, OGG, MP3, WAV, etc.
   * Avec fallback sur calcul WAV et validation de cohérence
   */
  async extractAudioMetadata(
    audioPath: string,
    fileSize?: number,
    mimeType?: string
  ): Promise<AudioMetadata> {
    try {
      const fullPath = path.join(this.uploadBasePath, audioPath);

      // Obtenir la taille du fichier si non fournie
      if (!fileSize) {
        const stats = await fs.stat(fullPath);
        fileSize = stats.size;
      }

      let metadata: AudioMetadata | null = null;

      // Tenter d'extraire avec music-metadata d'abord
      try {
        const parsedMetadata = await parseFile(fullPath);
        const format = parsedMetadata.format;

        metadata = {
          duration: Math.round((format.duration || 0) * 1000), // Convertir secondes -> millisecondes
          bitrate: format.bitrate || 0,
          sampleRate: format.sampleRate || 0,
          codec: format.codec || format.codecProfile || 'unknown',
          channels: format.numberOfChannels || 1,
        };

        logger.info('📊 [MetadataManager] music-metadata extraction:', {
          filePath: audioPath,
          duration: metadata.duration,
          durationSeconds: metadata.duration / 1000,
          bitrate: metadata.bitrate,
          codec: metadata.codec
        });
      } catch (parseError) {
        logger.warn('[MetadataManager] music-metadata failed, trying fallback methods:', parseError);
      }

      // Fallback 1: Si échec ou format WAV, essayer de lire le header WAV
      if ((!metadata || metadata.duration === 0) &&
          mimeType && (mimeType.includes('wav') || mimeType.includes('wave'))) {
        const wavMetadata = await this.calculateWavDuration(fullPath, fileSize);
        if (wavMetadata) {
          metadata = wavMetadata;
          logger.info('✅ [MetadataManager] WAV duration calculated from header');
        }
      }

      // Fallback 2: Pour M4A/AAC/MP4, utiliser ffprobe si music-metadata échoue
      if ((!metadata || metadata.duration === 0) &&
          mimeType && (mimeType.includes('m4a') || mimeType.includes('aac') ||
                       mimeType.includes('mp4') || mimeType.includes('x-m4a'))) {
        try {
          logger.info('🔍 [MetadataManager] Trying ffprobe for M4A/AAC format...');
          const ffprobeMetadata = await this.extractAudioWithFfprobe(fullPath);
          if (ffprobeMetadata) {
            metadata = ffprobeMetadata;
            logger.info('✅ [MetadataManager] M4A/AAC metadata extracted with ffprobe');
          }
        } catch (ffprobeError) {
          logger.warn('[MetadataManager] ffprobe fallback failed:', ffprobeError);
        }
      }

      // Si toujours pas de métadonnées valides
      if (!metadata || metadata.duration === 0) {
        logger.warn('[MetadataManager] No valid metadata extracted');
        return {
          duration: 0,
          bitrate: 0,
          sampleRate: 0,
          codec: 'unknown',
          channels: 1,
        };
      }

      // Valider la cohérence durée/taille
      if (mimeType && metadata.duration > 0 && fileSize > 0) {
        const validation = this.validateAudioCoherence(
          metadata.duration,
          fileSize,
          metadata.bitrate,
          mimeType
        );

        if (!validation.isValid && validation.estimatedDuration) {
          logger.warn('⚠️ [MetadataManager] Using estimated duration instead:', {
            originalDuration: metadata.duration,
            estimatedDuration: validation.estimatedDuration,
            reason: validation.reason
          });
          metadata.duration = validation.estimatedDuration;
        }
      }

      return metadata;
    } catch (error) {
      logger.error('[MetadataManager] Erreur extraction métadonnées audio', {
        filePath: audioPath,
        error: error instanceof Error ? error.message : error,
      });

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
   */
  async extractPdfMetadata(pdfPath: string): Promise<PdfMetadata> {
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
      logger.error('[MetadataManager] Erreur extraction métadonnées PDF', {
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
   */
  async extractVideoMetadata(videoPath: string): Promise<VideoMetadata> {
    const fullPath = path.join(this.uploadBasePath, videoPath);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        logger.warn('[MetadataManager] Timeout ffprobe pour:', videoPath);
        reject(new Error('ffprobe timeout after 30 seconds'));
      }, 30000);

      ffmpeg.ffprobe(fullPath, (err, metadata) => {
        clearTimeout(timeout);

        if (err) {
          reject(err);
          return;
        }

        const videoStream = metadata.streams?.find((s) => s.codec_type === 'video');

        if (!videoStream) {
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

        let fps = 0;
        if (videoStream.r_frame_rate) {
          const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
          fps = den ? num / den : 0;
        }

        resolve({
          duration: Math.round((metadata.format?.duration || 0) * 1000), // Convertir secondes -> millisecondes
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          fps: Math.round(fps * 100) / 100,
          videoCodec: videoStream.codec_name || 'unknown',
          bitrate: parseInt(String(metadata.format?.bit_rate || 0), 10),
        });
      });
    });
  }

  /**
   * Compte le nombre de lignes dans un fichier texte/code
   */
  async extractTextMetadata(textPath: string): Promise<TextMetadata> {
    try {
      const fullPath = path.join(this.uploadBasePath, textPath);
      const content = await fs.readFile(fullPath, 'utf-8');
      const lines = content.split('\n').length;

      return {
        lineCount: lines,
      };
    } catch (error) {
      logger.error('[MetadataManager] Erreur extraction métadonnées texte', {
        filePath: textPath,
        error: error instanceof Error ? error.message : error,
      });

      return {
        lineCount: 0,
      };
    }
  }

  /**
   * Extrait les métadonnées complètes selon le type
   * Avec validation intelligente utilisant les métadonnées du frontend
   */
  async extractMetadata(
    filePath: string,
    attachmentType: string,
    mimeType: string,
    providedMetadata?: any,
    fileSize?: number
  ): Promise<AttachmentMetadata> {
    const metadata: AttachmentMetadata = {};

    // Obtenir la taille du fichier si non fournie
    if (!fileSize && attachmentType === 'audio') {
      try {
        const fullPath = path.join(this.uploadBasePath, filePath);
        const stats = await fs.stat(fullPath);
        fileSize = stats.size;
      } catch (error) {
        logger.warn('[MetadataManager] Could not get file size:', error);
      }
    }

    if (attachmentType === 'image') {
      const imageMeta = await this.extractImageMetadata(filePath);
      metadata.width = imageMeta.width;
      metadata.height = imageMeta.height;
    }

    if (attachmentType === 'audio') {
      // Toujours extraire les métadonnées du serveur
      const extractedMeta = await this.extractAudioMetadata(filePath, fileSize, mimeType);

      // Si on a des métadonnées fournies par le frontend
      if (providedMetadata && providedMetadata.duration !== undefined) {
        const frontendDuration = Math.round(providedMetadata.duration); // En millisecondes
        const backendDuration = extractedMeta.duration; // En millisecondes

        logger.info('🔍 [MetadataManager] Comparing frontend vs backend metadata:', {
          frontendDurationMs: frontendDuration,
          backendDurationMs: backendDuration,
          frontendDurationSec: frontendDuration / 1000,
          backendDurationSec: backendDuration / 1000,
          fileSize,
          mimeType
        });

        // Si les deux sources ont des valeurs valides, les comparer
        if (frontendDuration > 0 && backendDuration > 0) {
          const difference = Math.abs(frontendDuration - backendDuration);
          const percentDifference = (difference / Math.max(frontendDuration, backendDuration)) * 100;

          // Si la différence est supérieure à 10%, c'est suspect
          if (percentDifference > 10) {
            logger.warn('⚠️ [MetadataManager] Durée incohérente entre frontend et backend:', {
              frontendDurationMs: frontendDuration,
              backendDurationMs: backendDuration,
              frontendDurationSec: frontendDuration / 1000,
              backendDurationSec: backendDuration / 1000,
              differenceMs: difference,
              percentDifference: Math.round(percentDifference)
            });

            // Valider avec la taille du fichier si disponible
            if (fileSize && fileSize > 0) {
              const frontendValidation = this.validateAudioCoherence(
                frontendDuration,
                fileSize,
                providedMetadata.bitrate || 128000,
                mimeType
              );

              const backendValidation = this.validateAudioCoherence(
                backendDuration,
                fileSize,
                extractedMeta.bitrate || 128000,
                mimeType
              );

              // Utiliser la valeur la plus cohérente avec la taille du fichier
              if (frontendValidation.isValid && !backendValidation.isValid) {
                logger.info('✅ [MetadataManager] Using frontend duration (more coherent with file size)');
                metadata.duration = frontendDuration;
              } else if (!frontendValidation.isValid && backendValidation.isValid) {
                logger.info('✅ [MetadataManager] Using backend duration (more coherent with file size)');
                metadata.duration = backendDuration;
              } else if (backendValidation.estimatedDuration) {
                logger.info('⚠️ [MetadataManager] Using estimated duration from validation');
                metadata.duration = backendValidation.estimatedDuration;
              } else {
                // Par défaut, privilégier le backend si pas de consensus
                logger.info('⚠️ [MetadataManager] Using backend duration by default');
                metadata.duration = backendDuration;
              }
            } else {
              // Sans taille de fichier, privilégier le backend
              logger.info('⚠️ [MetadataManager] Using backend duration (no file size for validation)');
              metadata.duration = backendDuration;
            }
          } else {
            // Les durées sont cohérentes, utiliser le backend (plus fiable)
            logger.info('✅ [MetadataManager] Durations are coherent, using backend');
            metadata.duration = backendDuration;
          }
        } else if (frontendDuration > 0 && backendDuration === 0) {
          // Le backend n'a pas réussi à extraire, utiliser le frontend comme fallback
          logger.info('⚠️ [MetadataManager] Backend extraction failed, using frontend as fallback');
          metadata.duration = frontendDuration;
        } else if (backendDuration > 0) {
          // Utiliser le backend
          metadata.duration = backendDuration;
        } else {
          // Aucune source valide
          metadata.duration = 0;
        }

        // Utiliser les autres métadonnées du backend si disponibles, sinon frontend
        metadata.bitrate = extractedMeta.bitrate || providedMetadata.bitrate || 0;
        metadata.sampleRate = extractedMeta.sampleRate || providedMetadata.sampleRate || 0;
        metadata.codec = extractedMeta.codec !== 'unknown' ? extractedMeta.codec : (providedMetadata.codec || 'unknown');
        metadata.channels = extractedMeta.channels || providedMetadata.channels || 1;

        if (providedMetadata.audioEffectsTimeline) {
          metadata.audioEffectsTimeline = providedMetadata.audioEffectsTimeline;
        }
      } else {
        // Pas de métadonnées frontend, utiliser uniquement le backend
        metadata.duration = extractedMeta.duration;
        metadata.bitrate = extractedMeta.bitrate;
        metadata.sampleRate = extractedMeta.sampleRate;
        metadata.codec = extractedMeta.codec;
        metadata.channels = extractedMeta.channels;
      }
    }

    if (attachmentType === 'video') {
      try {
        const videoMeta = await this.extractVideoMetadata(filePath);
        metadata.duration = videoMeta.duration;
        metadata.width = videoMeta.width;
        metadata.height = videoMeta.height;
        metadata.fps = videoMeta.fps;
        metadata.videoCodec = videoMeta.videoCodec;
        metadata.bitrate = videoMeta.bitrate;
      } catch (error) {
        logger.warn('[MetadataManager] Impossible d\'extraire métadonnées vidéo:', error);
        metadata.duration = 0;
        metadata.width = 0;
        metadata.height = 0;
        metadata.fps = 0;
        metadata.videoCodec = 'unknown';
        metadata.bitrate = 0;
      }
    }

    if (attachmentType === 'document' && mimeType === 'application/pdf') {
      const pdfMeta = await this.extractPdfMetadata(filePath);
      metadata.pageCount = pdfMeta.pageCount;
    }

    if (attachmentType === 'text' || attachmentType === 'code') {
      const textMeta = await this.extractTextMetadata(filePath);
      metadata.lineCount = textMeta.lineCount;
    }

    return metadata;
  }
}
