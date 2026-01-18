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

export interface AudioMetadata {
  duration: number;
  bitrate: number;
  sampleRate: number;
  codec: string;
  channels: number;
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  bitrate: number;
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
      console.error('[MetadataManager] Erreur génération miniature:', error);
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
      console.warn('[MetadataManager] Could not generate thumbnail from buffer:', error);
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
      console.error('[MetadataManager] Erreur extraction métadonnées image:', error);
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
      console.error('[MetadataManager] Erreur extraction métadonnées image depuis buffer:', error);
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

      return {
        duration: Math.round(format.duration || 0),
        bitrate: format.bitrate || 0,
        sampleRate: format.sampleRate || 0,
        codec: format.codec || format.codecProfile || 'unknown',
        channels: format.numberOfChannels || 1,
      };
    } catch (error) {
      console.error('[MetadataManager] Erreur extraction métadonnées audio:', {
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
      console.error('[MetadataManager] Erreur extraction métadonnées PDF:', {
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
        console.warn('[MetadataManager] Timeout ffprobe pour:', videoPath);
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
          duration: Math.round(metadata.format?.duration || 0),
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
      console.error('[MetadataManager] Erreur extraction métadonnées texte:', {
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
   */
  async extractMetadata(
    filePath: string,
    attachmentType: string,
    mimeType: string,
    providedMetadata?: any
  ): Promise<AttachmentMetadata> {
    const metadata: AttachmentMetadata = {};

    if (attachmentType === 'image') {
      const imageMeta = await this.extractImageMetadata(filePath);
      metadata.width = imageMeta.width;
      metadata.height = imageMeta.height;
    }

    if (attachmentType === 'audio') {
      if (providedMetadata && providedMetadata.duration !== undefined) {
        metadata.duration = Math.round(providedMetadata.duration);
        metadata.bitrate = providedMetadata.bitrate || 0;
        metadata.sampleRate = providedMetadata.sampleRate || 0;
        metadata.codec = providedMetadata.codec || 'unknown';
        metadata.channels = providedMetadata.channels || 1;

        if (providedMetadata.audioEffectsTimeline) {
          metadata.audioEffectsTimeline = providedMetadata.audioEffectsTimeline;
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
        console.warn('[MetadataManager] Impossible d\'extraire métadonnées vidéo:', error);
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
