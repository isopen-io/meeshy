/**
 * ZMQ Helpers
 * Fonctions utilitaires pour le client ZMQ
 */

import { promises as fs } from 'fs';
import { existsSync, statSync } from 'fs';
import path from 'path';
import { AUDIO_BASE64_SIZE_THRESHOLD } from '../types';
import { enhancedLogger } from '../../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'ZmqHelpers' });

/**
 * Résultat du chargement d'un fichier audio en binaire
 */
export interface AudioBinaryData {
  buffer: Buffer;
  mimeType: string;
  size: number;
}

/**
 * Charge un fichier audio en binaire si:
 * - Le fichier existe localement
 * - La taille est inférieure au seuil (5MB par défaut)
 *
 * @param audioPath Chemin du fichier audio
 * @returns { buffer, mimeType, size } ou null si trop gros ou inaccessible
 */
export async function loadAudioAsBinary(audioPath?: string): Promise<AudioBinaryData | null> {
  if (!audioPath) return null;

  try {
    // Vérifier si le fichier existe
    if (!existsSync(audioPath)) {
      logger.debug('Fichier audio non accessible localement', { audioPath });
      return null;
    }

    // Vérifier la taille
    const stats = statSync(audioPath);
    if (stats.size > AUDIO_BASE64_SIZE_THRESHOLD) {
      logger.debug('Fichier trop gros pour transfert ZMQ', { sizeMB: (stats.size / 1024 / 1024).toFixed(2), thresholdMB: AUDIO_BASE64_SIZE_THRESHOLD / 1024 / 1024 });
      return null;
    }

    // Lire le buffer brut (pas d'encodage base64!)
    const buffer = await fs.readFile(audioPath);

    // Déterminer le mime type
    const ext = path.extname(audioPath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.m4a': 'audio/mp4',
      '.ogg': 'audio/ogg',
      '.webm': 'audio/webm',
      '.aac': 'audio/aac',
      '.flac': 'audio/flac'
    };
    const mimeType = mimeTypes[ext] || 'audio/wav';

    logger.debug('Audio chargé en binaire', { sizeKB: (stats.size / 1024).toFixed(1), mimeType });

    return { buffer, mimeType, size: stats.size };
  } catch (error) {
    logger.warn('Erreur lecture fichier audio', error as Error);
    return null;
  }
}

/**
 * Convertit un format audio en mime type
 *
 * @param format Format audio (wav, mp3, m4a, etc.)
 * @returns Mime type correspondant
 */
export function audioFormatToMimeType(format: string): string {
  const formatMimeTypes: Record<string, string> = {
    'wav': 'audio/wav',
    'mp3': 'audio/mpeg',
    'm4a': 'audio/mp4',
    'ogg': 'audio/ogg',
    'webm': 'audio/webm',
    'aac': 'audio/aac',
    'flac': 'audio/flac'
  };
  return formatMimeTypes[format] || 'audio/wav';
}

/**
 * Convertit un mime type en format audio
 *
 * @param mimeType Mime type (audio/wav, audio/mpeg, etc.)
 * @returns Format audio (wav, mp3, m4a, etc.)
 */
export function mimeTypeToAudioFormat(mimeType: string): string {
  return mimeType.replace('audio/', '');
}
