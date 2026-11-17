import { z } from 'zod';

/**
 * Schémas de message.
 * Extrait de `validation.ts` (#19037), qui le ré-exporte.
 */

// =============================================================================
// MESSAGE SCHEMAS
// =============================================================================

/**
 * Types de message
 */
export const messageTypeEnum = z.enum(['text', 'image', 'file', 'audio', 'video', 'location', 'system']);

/**
 * Source du message
 */
const messageSourceEnum = z.enum(['user', 'system', 'ads', 'app', 'agent', 'authority']);

/**
 * Mode de chiffrement
 */
export const encryptionModeEnum = z.enum(['server', 'e2ee', 'hybrid']);

/**
 * Modèle de traduction
 */
const translationModelEnum = z.enum(['basic', 'medium', 'premium']);

/**
 * Schema de traduction de message (défini séparément pour éviter référence circulaire)
 */
const messageTranslationSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  targetLanguage: z.string(),
  translatedContent: z.string(),
  translationModel: translationModelEnum,
  confidenceScore: z.number().min(0).max(1).nullable().optional(),
  sourceLanguage: z.string().nullable().optional(),
  cached: z.boolean().nullable().optional(),
  createdAt: z.iso.datetime(),
});

/**
 * Schema expéditeur anonyme (défini séparément pour éviter référence circulaire)
 */
const anonymousSenderSchema = z.object({
  id: z.string(),
  username: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  language: z.string(),
  isMeeshyer: z.boolean(),
});

/**
 * Schema message minimal (défini séparément pour éviter référence circulaire)
 */
const messageMinimalSchema = z.object({
  id: z.string(),
  content: z.string(),
  senderId: z.string().nullable().optional(),
  messageType: messageTypeEnum,
  createdAt: z.iso.datetime(),
});

/**
 * Schémas pour les messages
 */
export const MessageSchemas = {
  // Traduction de message
  translation: messageTranslationSchema,

  // Expéditeur anonyme
  anonymousSender: anonymousSenderSchema,

  // Message minimal (pour listes)
  minimal: messageMinimalSchema,

  // Message complet (réponse API)
  full: z.object({
    id: z.string(),
    conversationId: z.string(),
    senderId: z.string().nullable().optional(),
    anonymousSenderId: z.string().nullable().optional(),
    content: z.string(),
    originalLanguage: z.string(),
    messageType: messageTypeEnum,
    messageSource: messageSourceEnum.optional(),
    isEdited: z.boolean(),
    editedAt: z.iso.datetime().nullable().optional(),
    deletedAt: z.iso.datetime().nullable().optional(),
    replyToId: z.string().nullable().optional(),
    forwardedFromId: z.string().nullable().optional(),
    forwardedFromConversationId: z.string().nullable().optional(),
    expiresAt: z.iso.datetime().nullable().optional(),
    isViewOnce: z.boolean().optional(),
    viewOnceCount: z.number().optional(),
    isBlurred: z.boolean().optional(),
    deliveredCount: z.number().optional(),
    readCount: z.number().optional(),
    deliveredToAllAt: z.iso.datetime().nullable().optional(),
    readByAllAt: z.iso.datetime().nullable().optional(),
    isEncrypted: z.boolean().optional(),
    encryptionMode: encryptionModeEnum.nullable().optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime().nullable().optional(),
    timestamp: z.iso.datetime().optional(),
    translations: z.array(messageTranslationSchema).optional(),
    attachments: z.array(z.object({})).nullable().optional(),
  }),

  // Envoyer un message (alias pour compatibilité)
  send: z.object({
    content: z.string().min(1, 'Le message ne peut pas être vide').max(10000, 'Message trop long'),
    // `.max(6)` : parité avec `CommonSchemas.language` ci-dessus — admet un code
    // ISO 639-3 régionalisé (`bas-CM`). Le `.max(5)` contredisait le plafond de
    // la SSOT (voir le commentaire de `CommonSchemas.language`).
    originalLanguage: z.string().min(2).max(6).default('fr'),
    messageType: messageTypeEnum.default('text'),
    replyToId: z.string().optional(),
  }),

  // Éditer un message (alias pour compatibilité)
  edit: z.object({
    content: z.string().min(1, 'Le message ne peut pas être vide').max(10000, 'Message trop long'),
    originalLanguage: z.string().min(2).max(6).optional(),
  }),
};
