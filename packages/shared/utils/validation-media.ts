import { z } from 'zod';
import { EMOJI_MAX_LENGTH } from '../types/reaction.js';
import { utf16Bounded } from './validation-primitives.js';
import { UserSchemas } from './validation-user.js';
import { encryptionModeEnum } from './validation-message.js';

/**
 * Schémas de pièce jointe, de réaction, de transcription, d’audio traduit et de modèle vocal.
 * Extrait de `validation.ts` (#19037), qui le ré-exporte.
 */

// =============================================================================
// ATTACHMENT SCHEMAS
// =============================================================================

/**
 * Status de scan de fichier
 */
const scanStatusEnum = z.enum(['pending', 'clean', 'infected', 'error']);

/**
 * Status de modération
 */
const moderationStatusEnum = z.enum(['pending', 'approved', 'flagged', 'rejected']);

/**
 * Schémas pour les attachements de messages
 */
export const AttachmentSchemas = {
  // Attachment minimal (pour listes)
  minimal: z.object({
    id: z.string(),
    fileName: z.string(),
    mimeType: z.string(),
    fileSize: z.number(),
    fileUrl: z.string(),
    thumbnailUrl: z.string().nullable().optional(),
    duration: z.number().nullable().optional(),
  }),

  // Attachment complet (réponse API)
  full: z.object({
    id: z.string(),
    messageId: z.string(),
    fileName: z.string(),
    originalName: z.string(),
    mimeType: z.string(),
    fileSize: z.number(),
    filePath: z.string(),
    fileUrl: z.string(),

    // User metadata
    title: z.string().nullable().optional(),
    alt: z.string().nullable().optional(),
    caption: z.string().nullable().optional(),

    // Forwarding
    forwardedFromAttachmentId: z.string().nullable().optional(),
    isForwarded: z.boolean().optional(),

    // View-once
    isViewOnce: z.boolean().optional(),
    maxViewOnceCount: z.number().nullable().optional(),
    viewOnceCount: z.number().optional(),
    isBlurred: z.boolean().optional(),

    // Image metadata
    width: z.number().nullable().optional(),
    height: z.number().nullable().optional(),
    thumbnailPath: z.string().nullable().optional(),
    thumbnailUrl: z.string().nullable().optional(),

    // Audio/Video metadata
    duration: z.number().nullable().optional(),
    bitrate: z.number().nullable().optional(),
    sampleRate: z.number().nullable().optional(),
    codec: z.string().nullable().optional(),
    channels: z.number().nullable().optional(),

    // Video-specific
    fps: z.number().nullable().optional(),
    videoCodec: z.string().nullable().optional(),

    // Document metadata
    pageCount: z.number().nullable().optional(),
    lineCount: z.number().nullable().optional(),

    // Upload info
    uploadedBy: z.string(),
    isAnonymous: z.boolean().optional(),

    // Security/Moderation
    scanStatus: scanStatusEnum.nullable().optional(),
    scanCompletedAt: z.iso.datetime().nullable().optional(),
    moderationStatus: moderationStatusEnum.nullable().optional(),
    moderationReason: z.string().nullable().optional(),

    // Delivery status
    deliveredToAllAt: z.iso.datetime().nullable().optional(),
    viewedByAllAt: z.iso.datetime().nullable().optional(),
    downloadedByAllAt: z.iso.datetime().nullable().optional(),
    viewedCount: z.number().optional(),
    downloadedCount: z.number().optional(),

    // Encryption
    isEncrypted: z.boolean().optional(),
    encryptionMode: encryptionModeEnum.nullable().optional(),

    // Timestamps
    createdAt: z.iso.datetime(),
    metadata: z.record(z.string(), z.unknown())
      .refine(
        (m) => { try { return JSON.stringify(m).length <= 8 * 1024; } catch { return false; } },
        { message: 'metadata exceeds 8KB serialized' }
      )
      .nullable().optional(),
  }),

  // Upload attachment request
  upload: z.object({
    title: z.string().max(200).optional(),
    alt: z.string().max(500).optional(),
    caption: z.string().max(1000).optional(),
    isViewOnce: z.boolean().optional(),
    isBlurred: z.boolean().optional(),
  }),
};

// =============================================================================
// REACTION SCHEMAS
// =============================================================================

/**
 * Schémas pour les réactions
 */
export const ReactionSchemas = {
  // Réaction complète
  full: z.object({
    id: z.string(),
    messageId: z.string(),
    userId: z.string().nullable().optional(),
    anonymousId: z.string().nullable().optional(),
    emoji: z.string(),
    createdAt: z.iso.datetime(),
    user: UserSchemas.minimal.nullable().optional(),
  }),

  // Résumé de réaction (groupé par emoji)
  summary: z.object({
    emoji: z.string(),
    count: z.number(),
    userReacted: z.boolean(),
    users: z.array(UserSchemas.minimal).optional(),
  }),

  // Ajouter une réaction
  add: z.object({
    emoji: utf16Bounded(z.string(), { min: 1, max: EMOJI_MAX_LENGTH }),
  }),
};

// =============================================================================
// AUDIO TRANSCRIPTION SCHEMAS
// =============================================================================

/**
 * Statut de transcription/traduction audio
 */
const audioProcessingStatusEnum = z.enum(['pending', 'processing', 'completed', 'failed']);

/**
 * Statut de modèle vocal
 */
const voiceModelStatusEnum = z.enum(['training', 'ready', 'failed', 'deleted']);

/**
 * Schémas pour l'audio traduit
 */
export const TranslatedAudioSchemas = {
  // Audio traduit complet
  full: z.object({
    id: z.string(),
    messageId: z.string(),
    transcriptionId: z.string(),
    targetLanguage: z.string(),
    translatedText: z.string(),
    audioUrl: z.string().nullable().optional(),
    voiceModelId: z.string().nullable().optional(),
    duration: z.number().nullable().optional(),
    status: audioProcessingStatusEnum,
    createdAt: z.iso.datetime(),
  }),

  // Demander une traduction audio
  request: z.object({
    transcriptionId: z.string().min(1),
    // `.max(6)` : parité avec `CommonSchemas.language` (code 639-3 régionalisé).
    targetLanguage: z.string().min(2).max(6),
    voiceModelId: z.string().optional(),
  }),
};

/**
 * Schémas pour les modèles vocaux
 */
export const VoiceModelSchemas = {
  // Modèle vocal complet
  full: z.object({
    id: z.string(),
    userId: z.string(),
    name: z.string(),
    language: z.string(),
    modelId: z.string(),
    status: voiceModelStatusEnum,
    sampleCount: z.number(),
    totalDuration: z.number().nullable().optional(),
    quality: z.number().nullable().optional(),
    isDefault: z.boolean(),
    isPublic: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  }),

  // Créer un modèle vocal
  create: z.object({
    name: z.string().min(1).max(100),
    // `.max(6)` : parité avec `CommonSchemas.language` (code 639-3 régionalisé).
    language: z.string().min(2).max(6),
    isPublic: z.boolean().default(false),
  }),

  // Mettre à jour un modèle vocal
  update: z.object({
    name: z.string().min(1).max(100).optional(),
    isDefault: z.boolean().optional(),
    isPublic: z.boolean().optional(),
  }),
};
