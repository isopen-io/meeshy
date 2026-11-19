/**
 * Utilitaires de validation pour les routes API, utilisables dans la passerelle.
 *
 * Point d'entrée PUBLIC : les schémas vivent par responsabilité dans
 * `validation-*.ts` (#19037) et `auth-schemas.ts` (#5216) ; ce fichier les
 * ré-exporte sous leur adresse historique et garde la session, le protocole
 * Signal et le journal de sécurité.
 */

import { z } from 'zod';
import { AuthSchemas } from './auth-schemas.js';
import { notificationTypeEnum } from './notification-type-enum.js';
import { UserSchemas } from './validation-user.js';
import { PASSWORD_MIN_LENGTH, passwordTooShort } from './validation-primitives.js';
import { encryptionModeEnum, MessageSchemas } from './validation-message.js';
import { ConversationSchemas } from './validation-conversation.js';
import { notificationPriorityEnum } from './validation-notification.js';

/**
 * Les bornes et motifs partagés vivent dans `./validation-primitives.js`
 * depuis #5216. Le ré-export garde les importeurs historiques, qui nommaient
 * déjà `PASSWORD_MIN_LENGTH` à cette adresse.
 */
export { PASSWORD_MIN_LENGTH } from './validation-primitives.js';

export { validateSchema, CommonSchemas } from './validation-common.js';
export { UserSchemas, EMOJI_REGEX, containsEmoji, isHttpUrl, httpUrlSchema, updateUserProfileSchema, isProfileImageReference, updateAvatarSchema, updateBannerSchema, updateUsernameSchema } from './validation-user.js';
export { messageTypeEnum, encryptionModeEnum, MessageSchemas } from './validation-message.js';
export { conversationTypeEnum, ConversationSchemas, callTypeEnum, AnonymousParticipantSchemas } from './validation-conversation.js';
export { AttachmentSchemas, ReactionSchemas, TranslatedAudioSchemas, VoiceModelSchemas } from './validation-media.js';
export { notificationTypeEnum, notificationPriorityEnum, NotificationPreferenceSchemas } from './validation-notification.js';

// =============================================================================
// AUTH SCHEMAS
// =============================================================================

/**
 * Les schémas d'authentification vivent dans `./auth-schemas.js` depuis #5216.
 * Le ré-export garde les importeurs historiques, qui nommaient déjà
 * `AuthSchemas` à cette adresse.
 */
export { AuthSchemas } from './auth-schemas.js';

// =============================================================================
// PASSWORD UPDATE SCHEMA
// =============================================================================

/**
 * Schéma de validation pour le changement de mot de passe.
 *
 * `currentPassword` est OPTIONNEL — et ne l'est que pour un compte qui n'en a
 * pas (#6424).
 *
 * Un compte né d'une inscription par e-mail seul n'a pas de mot de passe :
 * exiger l'ancien pour poser le premier ferait de la preuve une CONDITION
 * d'existence de ce qu'elle doit prouver, et le compte n'aurait jamais aucun
 * moyen d'en obtenir un.
 *
 * L'optionalité vit ici, dans la FORME ; l'exigence vit dans la ROUTE, qui
 * seule connaît l'état du compte (`PATCH /users/me/password` :
 * `user.password === null` ⇒ la session, obtenue par lien magique, EST la
 * preuve ; sinon l'ancien mot de passe est exigé et vérifié). Poser la règle
 * dans le schéma la rendrait aveugle à cet état, donc fausse dans un sens ou
 * dans l'autre.
 *
 * `confirmPassword` est OPTIONNEL : la confirmation est un contrôle d'INTERFACE
 * que chaque client vérifie avant d'envoyer (les apps natives iOS et Android ne
 * l'envoient jamais). Fourni (le web), il doit encore égaler `newPassword`.
 */
export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis').optional(),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH, passwordTooShort),
  confirmPassword: z.string().optional()
}).refine((data) => data.confirmPassword === undefined || data.newPassword === data.confirmPassword, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirmPassword']
});

// =============================================================================
// SESSION SCHEMAS
// =============================================================================

/**
 * Schémas pour les sessions
 */
export const SessionSchemas = {
  // Session minimale
  minimal: z.object({
    id: z.string(),
    deviceType: z.string().nullable().optional(),
    browserName: z.string().nullable().optional(),
    osName: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    isMobile: z.boolean(),
    createdAt: z.iso.datetime(),
  }),

  // Session complète
  full: z.object({
    id: z.string(),
    userId: z.string(),
    deviceType: z.string().nullable().optional(),
    deviceVendor: z.string().nullable().optional(),
    deviceModel: z.string().nullable().optional(),
    osName: z.string().nullable().optional(),
    osVersion: z.string().nullable().optional(),
    browserName: z.string().nullable().optional(),
    browserVersion: z.string().nullable().optional(),
    isMobile: z.boolean(),
    ipAddress: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    createdAt: z.iso.datetime(),
    lastActivityAt: z.iso.datetime(),
    isCurrentSession: z.boolean(),
    isTrusted: z.boolean(),
  }),

  // Validate session token
  validateToken: z.object({
    sessionToken: z.string().min(1),
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
    iv: z.string().length(16, 'IV must be 12 bytes base64'), // 12 bytes base64 = 16 chars (no padding)
    authTag: z.string().length(24, 'Auth tag must be 16 bytes base64'), // 16 bytes base64 = 24 chars (padded)
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

// =============================================================================
// SECURITY EVENT SCHEMAS
// =============================================================================

/**
 * Types d'événements de sécurité
 * Convention: SCREAMING_SNAKE_CASE (standard pour les événements de sécurité)
 */
export const securityEventTypeEnum = z.enum([
  // Login events
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'LOGOUT',
  // Password events
  'PASSWORD_CHANGE',
  'PASSWORD_RESET',
  'PASSWORD_RESET_REQUEST',
  'PASSWORD_RESET_SUCCESS',
  'PASSWORD_RESET_FAILED',
  'PASSWORD_RESET_INVALID_TOKEN',
  'PASSWORD_RESET_EXPIRED_TOKEN',
  'PASSWORD_RESET_TOKEN_REUSE',
  'PASSWORD_RESET_REVOKED_TOKEN',
  'PASSWORD_RESET_UNVERIFIED_EMAIL',
  'PASSWORD_RESET_LOCKED_ACCOUNT',
  'PASSWORD_RESET_ABUSE',
  'SUSPICIOUS_PASSWORD_RESET',
  // 2FA events
  'TWO_FA_ENABLED',
  'TWO_FA_DISABLED',
  'TWO_FA_FAILED',
  // Session events
  'SESSION_CREATED',
  'SESSION_TERMINATED',
  'SESSION_SUSPICIOUS',
  'SESSION_TRUSTED',
  'SESSION_TRUSTED_FAILED',
  // Account events
  'ACCOUNT_LOCKED',
  'ACCOUNT_UNLOCKED',
  // Rate limiting & Security
  'RATE_LIMIT_EXCEEDED',
  'UNAUTHORIZED_ACCESS',
  'IMPOSSIBLE_TRAVEL',
  'NEW_DEVICE_DETECTED',
  'BRUTE_FORCE_DETECTED',
  'SUSPICIOUS_ACTIVITY',
  // API keys
  'API_KEY_CREATED',
  'API_KEY_REVOKED',
]);

/**
 * Sévérité des événements de sécurité
 * Convention: SCREAMING_SNAKE_CASE
 */
export const securitySeverityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

/**
 * Statut des événements de sécurité
 * Convention: SCREAMING_SNAKE_CASE
 */
export const securityStatusEnum = z.enum(['SUCCESS', 'FAILED', 'BLOCKED']);

/**
 * Schémas pour les événements de sécurité
 */
export const SecurityEventSchemas = {
  // Événement complet
  full: z.object({
    id: z.string(),
    userId: z.string().nullable().optional(),
    eventType: securityEventTypeEnum,
    severity: securitySeverityEnum,
    details: z.string().nullable().optional(),
    ipAddress: z.string().nullable().optional(),
    userAgent: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    isResolved: z.boolean(),
    resolvedAt: z.iso.datetime().nullable().optional(),
    resolvedBy: z.string().nullable().optional(),
    createdAt: z.iso.datetime(),
  }),

  // Filtres de recherche
  search: z.object({
    userId: z.string().optional(),
    eventType: securityEventTypeEnum.optional(),
    severity: securitySeverityEnum.optional(),
    isResolved: z.boolean().optional(),
    startDate: z.iso.datetime().optional(),
    endDate: z.iso.datetime().optional(),
  }),
};

// =============================================================================
// API RESPONSE SCHEMAS
// =============================================================================

/**
 * Schémas pour les réponses API standardisées
 */
export const ApiResponseSchemas = {
  // Réponse de succès générique
  success: <T extends z.ZodTypeAny>(dataSchema: T) => z.object({
    success: z.literal(true),
    data: dataSchema,
  }),

  // Réponse d'erreur
  error: z.object({
    success: z.literal(false),
    error: z.string(),
    code: z.string().optional(),
    details: z.array(z.object({
      field: z.string(),
      message: z.string(),
    })).optional(),
  }),

  // Liste paginée
  paginatedList: <T extends z.ZodTypeAny>(itemSchema: T, itemsKey: string = 'items') => z.object({
    success: z.literal(true),
    data: z.object({
      [itemsKey]: z.array(itemSchema),
      totalCount: z.number(),
      hasMore: z.boolean().optional(),
    }),
  }),

  // ===== AUTH RESPONSES =====

  loginResponse: z.object({
    success: z.literal(true),
    data: z.object({
      user: UserSchemas.full,
      token: z.string(),
      sessionToken: z.string(),
      session: SessionSchemas.minimal,
      expiresIn: z.number(),
    }),
  }),

  registerResponse: z.object({
    success: z.literal(true),
    data: z.object({
      user: UserSchemas.full,
      token: z.string(),
      expiresIn: z.number(),
    }),
  }),

  sessionsListResponse: z.object({
    success: z.literal(true),
    data: z.object({
      sessions: z.array(SessionSchemas.full),
      totalCount: z.number(),
    }),
  }),

  // ===== USER RESPONSES =====

  userResponse: z.object({
    success: z.literal(true),
    data: z.object({
      user: UserSchemas.full,
    }),
  }),

  // ===== CONVERSATION RESPONSES =====

  conversationResponse: z.object({
    success: z.literal(true),
    data: z.object({
      conversation: ConversationSchemas.full,
    }),
  }),

  conversationListResponse: z.object({
    success: z.literal(true),
    data: z.object({
      conversations: z.array(ConversationSchemas.minimal),
      totalCount: z.number(),
      hasMore: z.boolean().optional(),
    }),
  }),

  // ===== MESSAGE RESPONSES =====

  messageResponse: z.object({
    success: z.literal(true),
    data: z.object({
      message: MessageSchemas.full,
    }),
  }),

  messageListResponse: z.object({
    success: z.literal(true),
    data: z.object({
      messages: z.array(MessageSchemas.full),
      totalCount: z.number(),
      hasMore: z.boolean().optional(),
    }),
  }),

  // ===== PARTICIPANTS RESPONSES =====

  participantsListResponse: z.object({
    success: z.literal(true),
    data: z.object({
      participants: z.array(ConversationSchemas.participant.extend({
        user: UserSchemas.minimal,
      })),
      totalCount: z.number(),
    }),
  }),
};

// =============================================================================
// TYPE EXPORTS (Validated types - prefixed with V to avoid conflicts)
// =============================================================================

export type VLoginRequest = z.infer<typeof AuthSchemas.login>;
export type VRegisterRequest = z.infer<typeof AuthSchemas.register>;
export type VVerifyEmailRequest = z.infer<typeof AuthSchemas.verifyEmail>;
export type VVerifyPhoneRequest = z.infer<typeof AuthSchemas.verifyPhone>;
export type VChangePasswordRequest = z.infer<typeof AuthSchemas.changePassword>;
export type VResetPasswordRequest = z.infer<typeof AuthSchemas.resetPassword>;

export type VSessionMinimal = z.infer<typeof SessionSchemas.minimal>;
export type VSessionFull = z.infer<typeof SessionSchemas.full>;

export type VEncryptionMode = z.infer<typeof encryptionModeEnum>;

// User profile update types
export type VUpdatePassword = z.infer<typeof updatePasswordSchema>;

// Notification types
export type VNotificationType = z.infer<typeof notificationTypeEnum>;
export type VNotificationPriority = z.infer<typeof notificationPriorityEnum>;

// Security event types
export type VSecurityEventType = z.infer<typeof securityEventTypeEnum>;
export type VSecuritySeverity = z.infer<typeof securitySeverityEnum>;
export type VSecurityStatus = z.infer<typeof securityStatusEnum>;
export type VSecurityEventFull = z.infer<typeof SecurityEventSchemas.full>;
export type VSecurityEventSearch = z.infer<typeof SecurityEventSchemas.search>;
