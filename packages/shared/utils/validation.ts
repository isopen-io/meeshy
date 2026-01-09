/**
 * Utilitaires de validation pour les routes API
 * Utilisables dans Gateway
 */

import { z } from 'zod';
import { ErrorCode } from '../types/errors';
import { createError } from './errors';

/**
 * Valider un schéma Zod et retourner une erreur standardisée
 */
export function validateSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    const errors = result.error.issues.map((err: any) => ({
      path: err.path.join('.'),
      message: err.message,
    }));
    
    throw createError(
      ErrorCode.VALIDATION_ERROR,
      'Données invalides',
      { errors, context }
    );
  }
  
  return result.data;
}

/**
 * Schémas de validation réutilisables
 */
export const CommonSchemas = {
  // Pagination
  pagination: z.object({
    limit: z.string().optional().transform((val: any) => parseInt(val || '20', 10)),
    offset: z.string().optional().transform((val: any) => parseInt(val || '0', 10)),
  }),
  
  // Message pagination
  messagePagination: z.object({
    limit: z.string().optional().transform((val: any) => parseInt(val || '20', 10)),
    offset: z.string().optional().transform((val: any) => parseInt(val || '0', 10)),
    before: z.string().optional(),
  }),
  
  // ID MongoDB
  mongoId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID MongoDB invalide'),
  
  // Langue
  language: z.string().min(2).max(5).regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Code langue invalide'),
  
  // Type de conversation
  conversationType: z.enum(['direct', 'group', 'public', 'global']),
  
  // Type de message
  messageType: z.enum(['text', 'image', 'file', 'system']),
  
  // Contenu de message
  messageContent: z.string().min(1, 'Le message ne peut pas être vide').max(10000, 'Message trop long'),
  
  // Titre de conversation
  conversationTitle: z.string().min(1, 'Le titre ne peut pas être vide').max(100, 'Titre trop long'),
  
  // Description
  description: z.string().max(500, 'Description trop longue').optional(),
  
  // Email
  email: z.string().email('Email invalide'),
  
  // Username
  username: z.string().min(3, 'Username trop court').max(30, 'Username trop long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username invalide'),
  
  // Conversation identifier (custom identifier for conversations)
  conversationIdentifier: z.string()
    .min(1, 'L\'identifiant ne peut pas être vide')
    .max(50, 'Identifiant trop long')
    .regex(/^[a-zA-Z0-9\-_@]*$/, 'L\'identifiant ne peut contenir que des lettres, chiffres, tirets, underscores et @')
    .optional(),
};

/**
 * Schémas pour les routes de conversations
 */
export const ConversationSchemas = {
  // Créer une conversation
  create: z.object({
    type: CommonSchemas.conversationType,
    title: CommonSchemas.conversationTitle.optional(),
    description: CommonSchemas.description,
    participantIds: z.array(z.string()).optional().default([]),
    communityId: z.string().optional(),
    identifier: CommonSchemas.conversationIdentifier,
  }),
  
  // Mettre à jour une conversation
  update: z.object({
    title: CommonSchemas.conversationTitle.optional(),
    description: CommonSchemas.description,
    type: CommonSchemas.conversationType.optional(),
  }).refine((data: any) => Object.keys(data).length > 0, {
    message: 'Au moins un champ doit être fourni pour la mise à jour',
  }),
  
  // Envoyer un message
  sendMessage: z.object({
    content: CommonSchemas.messageContent,
    originalLanguage: CommonSchemas.language.optional().default('fr'),
    messageType: CommonSchemas.messageType.optional().default('text'),
    replyToId: z.string().optional(),
  }),
  
  // Éditer un message
  editMessage: z.object({
    content: CommonSchemas.messageContent,
    originalLanguage: CommonSchemas.language.optional(),
  }),
  
  // Ajouter un participant
  addParticipant: z.object({
    userId: z.string().min(1, 'userId requis'),
  }),
  
  // Recherche
  search: z.object({
    q: z.string().min(1, 'Terme de recherche requis'),
  }),
  
  // Filtres participants
  participantsFilters: z.object({
    onlineOnly: z.string().optional(),
    role: z.string().optional(),
    search: z.string().optional(),
    limit: z.string().optional().transform((val: any) => parseInt(val || '50', 10)),
  }),
};

// ============================================================================
// Signal Protocol / Encryption Validation
// ============================================================================

/**
 * Constants for Signal Protocol validation
 */
export const SignalProtocolLimits = {
  /** Maximum encrypted message size in bytes (64KB) */
  MAX_MESSAGE_SIZE: 64 * 1024,
  /** Maximum message number to prevent DoS via large skips */
  MAX_MESSAGE_NUMBER: 2_147_483_647, // 2^31 - 1
  /** Maximum skipped message keys to store per session */
  MAX_SKIPPED_KEYS: 100,
  /** Maximum pre-key batch size */
  MAX_PREKEY_BATCH: 100,
  /** Minimum key size in bytes */
  MIN_KEY_SIZE: 16,
  /** Standard AES-256 key size */
  AES_256_KEY_SIZE: 32,
  /** Standard IV size for AES-GCM */
  AES_GCM_IV_SIZE: 12,
  /** Standard auth tag size for AES-GCM */
  AES_GCM_TAG_SIZE: 16,
  /** EC-P256 public key size (uncompressed) */
  EC_P256_PUBLIC_KEY_SIZE: 65,
  /** EC-P256 private key size */
  EC_P256_PRIVATE_KEY_SIZE: 32,
  /** Registration ID range (14-bit) */
  MAX_REGISTRATION_ID: 16383,
} as const;

/**
 * Signal Protocol validation result
 */
export interface SignalValidationResult {
  valid: boolean;
  error?: string;
  code?: string;
}

/**
 * Signal Protocol validation utilities
 * Use these to validate encryption-related inputs and prevent DoS attacks
 */
export const SignalValidation = {
  /**
   * Validate encrypted message size
   * Prevents DoS via oversized messages
   */
  validateMessageSize(
    data: Buffer | Uint8Array | string,
    maxSize: number = SignalProtocolLimits.MAX_MESSAGE_SIZE
  ): SignalValidationResult {
    const size = typeof data === 'string' ? Buffer.byteLength(data, 'utf8') : data.length;

    if (size > maxSize) {
      return {
        valid: false,
        error: `Message size ${size} exceeds maximum ${maxSize} bytes`,
        code: 'MESSAGE_TOO_LARGE',
      };
    }

    if (size === 0) {
      return {
        valid: false,
        error: 'Message cannot be empty',
        code: 'MESSAGE_EMPTY',
      };
    }

    return { valid: true };
  },

  /**
   * Validate message number for Double Ratchet
   * Prevents DoS via large message number skips
   */
  validateMessageNumber(
    messageNumber: number,
    expectedNumber: number,
    maxSkip: number = SignalProtocolLimits.MAX_SKIPPED_KEYS
  ): SignalValidationResult {
    if (!Number.isInteger(messageNumber) || messageNumber < 0) {
      return {
        valid: false,
        error: 'Message number must be a non-negative integer',
        code: 'INVALID_MESSAGE_NUMBER',
      };
    }

    if (messageNumber > SignalProtocolLimits.MAX_MESSAGE_NUMBER) {
      return {
        valid: false,
        error: `Message number ${messageNumber} exceeds maximum ${SignalProtocolLimits.MAX_MESSAGE_NUMBER}`,
        code: 'MESSAGE_NUMBER_OVERFLOW',
      };
    }

    // Prevent DoS by limiting how many keys we'd have to skip
    if (messageNumber > expectedNumber + maxSkip) {
      return {
        valid: false,
        error: `Message number skip of ${messageNumber - expectedNumber} exceeds maximum ${maxSkip}`,
        code: 'MESSAGE_NUMBER_SKIP_TOO_LARGE',
      };
    }

    return { valid: true };
  },

  /**
   * Validate cryptographic key buffer
   */
  validateKeyBuffer(
    key: Buffer | Uint8Array | null | undefined,
    expectedSize: number,
    keyName: string = 'Key'
  ): SignalValidationResult {
    if (!key) {
      return {
        valid: false,
        error: `${keyName} is required`,
        code: 'KEY_MISSING',
      };
    }

    if (key.length !== expectedSize) {
      return {
        valid: false,
        error: `${keyName} must be ${expectedSize} bytes, got ${key.length}`,
        code: 'KEY_INVALID_SIZE',
      };
    }

    return { valid: true };
  },

  /**
   * Validate registration ID (14-bit value)
   */
  validateRegistrationId(registrationId: number): SignalValidationResult {
    if (!Number.isInteger(registrationId) || registrationId < 1 || registrationId > SignalProtocolLimits.MAX_REGISTRATION_ID) {
      return {
        valid: false,
        error: `Registration ID must be between 1 and ${SignalProtocolLimits.MAX_REGISTRATION_ID}`,
        code: 'INVALID_REGISTRATION_ID',
      };
    }
    return { valid: true };
  },

  /**
   * Validate pre-key ID
   */
  validatePreKeyId(preKeyId: number): SignalValidationResult {
    if (!Number.isInteger(preKeyId) || preKeyId < 0 || preKeyId > SignalProtocolLimits.MAX_MESSAGE_NUMBER) {
      return {
        valid: false,
        error: 'Pre-key ID must be a non-negative integer',
        code: 'INVALID_PREKEY_ID',
      };
    }
    return { valid: true };
  },

  /**
   * Validate AES-GCM encrypted payload structure
   */
  validateEncryptedPayload(payload: {
    ciphertext?: Buffer | Uint8Array;
    iv?: Buffer | Uint8Array;
    authTag?: Buffer | Uint8Array;
  }): SignalValidationResult {
    if (!payload.ciphertext || payload.ciphertext.length === 0) {
      return {
        valid: false,
        error: 'Ciphertext is required and cannot be empty',
        code: 'CIPHERTEXT_MISSING',
      };
    }

    const ivResult = this.validateKeyBuffer(
      payload.iv as Buffer,
      SignalProtocolLimits.AES_GCM_IV_SIZE,
      'IV'
    );
    if (!ivResult.valid) return ivResult;

    const tagResult = this.validateKeyBuffer(
      payload.authTag as Buffer,
      SignalProtocolLimits.AES_GCM_TAG_SIZE,
      'Auth tag'
    );
    if (!tagResult.valid) return tagResult;

    return { valid: true };
  },
};

/**
 * Zod schemas for Signal Protocol
 */
export const SignalSchemas = {
  // Pre-key bundle request
  preKeyBundle: z.object({
    identityKey: z.string().min(1, 'Identity key is required'),
    registrationId: z.number().int().min(1).max(SignalProtocolLimits.MAX_REGISTRATION_ID),
    deviceId: z.number().int().min(1),
    preKeyId: z.number().int().min(0).nullable(),
    preKeyPublic: z.string().nullable(),
    signedPreKeyId: z.number().int().min(0),
    signedPreKeyPublic: z.string().min(1),
    signedPreKeySignature: z.string().min(1),
  }),

  // Encrypted message
  encryptedMessage: z.object({
    ciphertext: z.string().min(1, 'Ciphertext is required'),
    iv: z.string().length(24, 'IV must be 12 bytes base64'), // 12 bytes = 24 base64 chars
    authTag: z.string().length(24, 'Auth tag must be 16 bytes base64'), // 16 bytes with padding
    messageNumber: z.number().int().min(0).max(SignalProtocolLimits.MAX_MESSAGE_NUMBER),
  }),

  // Session establishment
  sessionEstablish: z.object({
    recipientUserId: z.string().min(1).max(255),
    conversationId: z.string().min(1).max(255),
    ephemeralKey: z.string().optional(),
  }),
};

/**
 * Securely clear a buffer by overwriting with zeros
 * Use this to clear sensitive key material after use
 */
export function zeroizeBuffer(buffer: Buffer | Uint8Array | null | undefined): void {
  if (!buffer) return;

  // Fill with zeros
  if (Buffer.isBuffer(buffer)) {
    buffer.fill(0);
  } else if (buffer instanceof Uint8Array) {
    buffer.fill(0);
  }
}

/**
 * Create a copy of a buffer and zeroize the original
 * Useful for passing keys to functions while clearing local copy
 */
export function copyAndZeroize(buffer: Buffer): Buffer {
  const copy = Buffer.from(buffer);
  zeroizeBuffer(buffer);
  return copy;
}
