/**
 * Utilitaires de validation pour les routes API
 * Utilisables dans Gateway
 */

import { z } from 'zod';
import { ErrorCode } from '../types/errors.js';
import { createError } from './errors.js';

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

// =============================================================================
// COMMON SCHEMAS
// =============================================================================

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

// =============================================================================
// USER SCHEMAS
// =============================================================================

/**
 * Rôles utilisateur
 */
export const userRoleEnum = z.enum([
  'USER', 'ADMIN', 'MODO', 'BIGBOSS', 'AUDIT', 'ANALYST',
  'MODERATOR', 'CREATOR', 'MEMBER'
]);

/**
 * Schémas pour la validation des utilisateurs
 */
export const UserSchemas = {
  // Permissions utilisateur
  permissions: z.object({
    canAccessAdmin: z.boolean(),
    canManageUsers: z.boolean(),
    canManageGroups: z.boolean(),
    canManageConversations: z.boolean(),
    canViewAnalytics: z.boolean(),
    canModerateContent: z.boolean(),
    canViewAuditLogs: z.boolean(),
    canManageNotifications: z.boolean(),
    canManageTranslations: z.boolean(),
  }),

  // User minimal (pour listes et références)
  minimal: z.object({
    id: z.string(),
    username: z.string(),
    displayName: z.string(),
    avatar: z.string().nullable().optional(),
    isOnline: z.boolean().optional(),
  }),

  // User complet (réponse API)
  full: z.object({
    id: z.string(),
    username: z.string(),
    email: z.string().email().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    displayName: z.string().optional(),
    bio: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
    phoneNumber: z.string().nullable().optional(),
    phoneCountryCode: z.string().nullable().optional(),
    role: userRoleEnum.optional(),
    isActive: z.boolean().optional(),
    deactivatedAt: z.string().datetime().nullable().optional(),
    systemLanguage: z.string().optional(),
    regionalLanguage: z.string().optional(),
    customDestinationLanguage: z.string().nullable().optional(),
    autoTranslateEnabled: z.boolean().optional(),
    translateToSystemLanguage: z.boolean().optional(),
    translateToRegionalLanguage: z.boolean().optional(),
    useCustomDestination: z.boolean().optional(),
    isOnline: z.boolean().optional(),
    lastActiveAt: z.string().datetime().nullable().optional(),
    emailVerifiedAt: z.string().datetime().nullable().optional(),
    phoneVerifiedAt: z.string().datetime().nullable().optional(),
    twoFactorEnabledAt: z.string().datetime().nullable().optional(),
    lastPasswordChange: z.string().datetime().nullable().optional(),
    lastLoginIp: z.string().nullable().optional(),
    lastLoginLocation: z.string().nullable().optional(),
    lastLoginDevice: z.string().nullable().optional(),
    timezone: z.string().nullable().optional(),
    profileCompletionRate: z.number().nullable().optional(),
    createdAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional(),
  }),

  // Mise à jour du profil
  update: z.object({
    firstName: z.string().min(1).max(50).optional(),
    lastName: z.string().min(1).max(50).optional(),
    displayName: z.string().min(1).max(100).optional(),
    bio: z.string().max(500).optional(),
    avatar: z.string().url().optional(),
    phoneNumber: z.string().optional(),
    systemLanguage: z.string().min(2).max(5).optional(),
    regionalLanguage: z.string().min(2).max(5).optional(),
    customDestinationLanguage: z.string().min(2).max(5).nullable().optional(),
    autoTranslateEnabled: z.boolean().optional(),
    translateToSystemLanguage: z.boolean().optional(),
    translateToRegionalLanguage: z.boolean().optional(),
    useCustomDestination: z.boolean().optional(),
    timezone: z.string().optional(),
  }),
};

// =============================================================================
// EMOJI VALIDATION UTILITIES
// =============================================================================

/**
 * Regex pour détecter les emojis Unicode
 */
export const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;

/**
 * Vérifie si une chaîne contient des emojis
 */
export function containsEmoji(text: string): boolean {
  return EMOJI_REGEX.test(text);
}

/**
 * Refinement Zod pour rejeter les emojis
 */
const noEmoji = (val: string | undefined) => {
  if (!val) return true;
  return !containsEmoji(val);
};

// =============================================================================
// USER UPDATE SCHEMAS (for routes)
// =============================================================================

/**
 * Schéma de validation pour la mise à jour du profil utilisateur
 * Avec validation stricte (rejette les champs inconnus)
 */
export const updateUserProfileSchema = z.object({
  firstName: z.string().min(1).optional().refine(noEmoji, {
    message: 'Le prénom ne peut pas contenir d\'emojis'
  }),
  lastName: z.string().min(1).optional().refine(noEmoji, {
    message: 'Le nom ne peut pas contenir d\'emojis'
  }),
  displayName: z.string().optional(), // Autorise les emojis dans displayName
  email: z.string().email().optional(),
  phoneNumber: z.union([z.string(), z.null()]).optional(),
  bio: z.string().max(500).optional(),
  systemLanguage: z.string().min(2).max(5).optional(),
  regionalLanguage: z.string().min(2).max(5).optional(),
  customDestinationLanguage: z.union([z.literal(''), z.null(), z.string().min(2).max(5)]).optional(),
  autoTranslateEnabled: z.boolean().optional(),
  translateToSystemLanguage: z.boolean().optional(),
  translateToRegionalLanguage: z.boolean().optional(),
  useCustomDestination: z.boolean().optional(),
}).strict();

/**
 * Schéma de validation pour l'upload d'avatar
 */
export const updateAvatarSchema = z.object({
  avatar: z.string().refine(
    (data) => {
      return data.startsWith('http://') ||
             data.startsWith('https://') ||
             data.startsWith('data:image/');
    },
    'Format avatar invalide. Doit être une URL ou une image base64'
  )
}).strict();

/**
 * Schéma de validation pour le changement de mot de passe
 */
export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
  newPassword: z.string().min(8, 'Nouveau mot de passe requis (min 8 caractères)'),
  confirmPassword: z.string().min(1, 'Confirmation du mot de passe requise')
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirmPassword']
});

/**
 * Schéma de validation pour le changement de username
 */
export const updateUsernameSchema = z.object({
  newUsername: z.string()
    .min(2, 'Username trop court (min 2 caractères)')
    .max(16, 'Username trop long (max 16 caractères)')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username invalide (lettres, chiffres, - et _ uniquement)'),
  currentPassword: z.string().min(1, 'Mot de passe requis pour confirmer le changement')
}).strict();

// =============================================================================
// AUTH SCHEMAS
// =============================================================================

/**
 * Schémas pour l'authentification
 */
export const AuthSchemas = {
  // Login request
  login: z.object({
    username: z.string().min(2).max(50),
    password: z.string().min(1),
    rememberDevice: z.boolean().optional().default(false), // Trust this device for longer sessions (365 days)
  }),

  // Register request
  register: z.object({
    username: z.string()
      .min(2, 'Username trop court (min 2)')
      .max(16, 'Username trop long (max 16)')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Username invalide (lettres, chiffres, - et _ uniquement)'),
    password: z.string()
      .min(8, 'Mot de passe trop court (min 8 caractères)'),
    firstName: z.string().min(1).max(50)
      .regex(/^(?=.*\p{L})[\p{L}\s'.-]+$/u, 'Le prénom doit contenir au moins une lettre'),
    lastName: z.string().min(1).max(50)
      .regex(/^(?=.*\p{L})[\p{L}\s'.-]+$/u, 'Le nom doit contenir au moins une lettre'),
    email: z.string().email('Email invalide'),
    phoneNumber: z.string().optional(),
    phoneCountryCode: z.string().length(2).optional(),
    systemLanguage: z.string().min(2).max(5).default('fr'),
    regionalLanguage: z.string().min(2).max(5).default('fr'),
    phoneTransferToken: z.string().optional(), // Token proving SMS verification for phone transfer
  }),

  // Refresh token
  refreshToken: z.object({
    token: z.string().min(1),
    sessionToken: z.string().optional(),
  }),

  // Verify email
  verifyEmail: z.object({
    token: z.string().min(1),
    email: z.string().email(),
  }),

  // Resend verification
  resendVerification: z.object({
    email: z.string().email(),
  }),

  // Phone verification
  sendPhoneCode: z.object({
    phoneNumber: z.string().min(8),
  }),

  verifyPhone: z.object({
    phoneNumber: z.string().min(8),
    code: z.string().length(6),
  }),

  // Password reset
  requestPasswordReset: z.object({
    email: z.string().email(),
  }),

  resetPassword: z.object({
    token: z.string().min(1),
    newPassword: z.string().min(8),
  }),

  // Change password (authenticated)
  changePassword: z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
  }),
};

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
    createdAt: z.string().datetime(),
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
    createdAt: z.string().datetime(),
    lastActivityAt: z.string().datetime(),
    isCurrentSession: z.boolean(),
    isTrusted: z.boolean(),
  }),

  // Validate session token
  validateToken: z.object({
    sessionToken: z.string().min(1),
  }),
};

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
export const messageSourceEnum = z.enum(['user', 'system', 'ads', 'app', 'agent', 'authority']);

/**
 * Mode de chiffrement
 */
export const encryptionModeEnum = z.enum(['server', 'e2ee', 'hybrid']);

/**
 * Modèle de traduction
 */
export const translationModelEnum = z.enum(['basic', 'medium', 'premium']);

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
  createdAt: z.string().datetime(),
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
  createdAt: z.string().datetime(),
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
    editedAt: z.string().datetime().nullable().optional(),
    isDeleted: z.boolean(),
    deletedAt: z.string().datetime().nullable().optional(),
    replyToId: z.string().nullable().optional(),
    forwardedFromId: z.string().nullable().optional(),
    forwardedFromConversationId: z.string().nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    isViewOnce: z.boolean().optional(),
    viewOnceCount: z.number().optional(),
    isBlurred: z.boolean().optional(),
    deliveredCount: z.number().optional(),
    readCount: z.number().optional(),
    deliveredToAllAt: z.string().datetime().nullable().optional(),
    readByAllAt: z.string().datetime().nullable().optional(),
    isEncrypted: z.boolean().optional(),
    encryptionMode: encryptionModeEnum.nullable().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime().nullable().optional(),
    timestamp: z.string().datetime().optional(),
    translations: z.array(messageTranslationSchema).optional(),
    attachments: z.array(z.object({})).nullable().optional(),
  }),

  // Envoyer un message (alias pour compatibilité)
  send: z.object({
    content: z.string().min(1, 'Le message ne peut pas être vide').max(10000, 'Message trop long'),
    originalLanguage: z.string().min(2).max(5).default('fr'),
    messageType: messageTypeEnum.default('text'),
    replyToId: z.string().optional(),
  }),

  // Éditer un message (alias pour compatibilité)
  edit: z.object({
    content: z.string().min(1, 'Le message ne peut pas être vide').max(10000, 'Message trop long'),
    originalLanguage: z.string().min(2).max(5).optional(),
  }),
};

// =============================================================================
// CONVERSATION SCHEMAS
// =============================================================================

/**
 * Types de conversation
 */
export const conversationTypeEnum = z.enum(['direct', 'group', 'public', 'global', 'broadcast']);

/**
 * Statut de conversation
 */
export const conversationStatusEnum = z.enum(['active', 'archived', 'deleted']);

/**
 * Visibilité de conversation
 */
export const conversationVisibilityEnum = z.enum(['public', 'private', 'restricted']);

/**
 * Type de lien de conversation
 */
export const conversationLinkTypeEnum = z.enum(['invite', 'share', 'embed']);

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

  // ===== SCHEMAS COMPLETS POUR RÉPONSES API =====

  // Permissions d'un participant
  participantPermissions: z.object({
    canInvite: z.boolean(),
    canRemove: z.boolean(),
    canEdit: z.boolean(),
    canDelete: z.boolean(),
    canModerate: z.boolean(),
  }),

  // Participant de conversation
  participant: z.object({
    userId: z.string(),
    role: userRoleEnum,
    joinedAt: z.string().datetime(),
    isActive: z.boolean(),
    permissions: z.object({
      canInvite: z.boolean(),
      canRemove: z.boolean(),
      canEdit: z.boolean(),
      canDelete: z.boolean(),
      canModerate: z.boolean(),
    }).nullable().optional(),
  }),

  // Paramètres de conversation
  settings: z.object({
    allowAnonymous: z.boolean(),
    requireApproval: z.boolean(),
    maxParticipants: z.number().nullable().optional(),
    autoArchive: z.boolean().nullable().optional(),
    translationEnabled: z.boolean(),
    defaultLanguage: z.string().nullable().optional(),
    allowedLanguages: z.array(z.string()).nullable().optional(),
  }),

  // Lien de partage
  link: z.object({
    id: z.string(),
    type: conversationLinkTypeEnum,
    url: z.string(),
    expiresAt: z.string().datetime().nullable().optional(),
    maxUses: z.number().nullable().optional(),
    currentUses: z.number(),
    isActive: z.boolean(),
    createdBy: z.string(),
    createdAt: z.string().datetime(),
    allowAnonymousMessages: z.boolean().nullable().optional(),
    allowAnonymousFiles: z.boolean().nullable().optional(),
    allowViewHistory: z.boolean().nullable().optional(),
    requireNickname: z.boolean().nullable().optional(),
    requireEmail: z.boolean().nullable().optional(),
  }),

  // Statistiques de conversation
  stats: z.object({
    totalMessages: z.number(),
    totalParticipants: z.number(),
    activeParticipants: z.number(),
    messagesLast24h: z.number(),
    messagesLast7days: z.number(),
    averageResponseTime: z.number(),
    lastActivity: z.string().datetime(),
    topLanguages: z.array(z.object({
      language: z.string(),
      messageCount: z.number(),
      percentage: z.number(),
    })),
  }),

  // Conversation minimale (pour listes)
  minimal: z.object({
    id: z.string(),
    identifier: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    type: conversationTypeEnum,
    avatar: z.string().nullable().optional(),
    memberCount: z.number(),
    lastMessage: messageMinimalSchema.nullable().optional(),
    lastMessageAt: z.string().datetime().nullable().optional(),
    unreadCount: z.number().nullable().optional(),
  }),

  // Conversation complète (réponse API)
  full: z.object({
    id: z.string(),
    identifier: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    type: conversationTypeEnum,
    status: conversationStatusEnum,
    visibility: conversationVisibilityEnum,
    image: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
    banner: z.string().nullable().optional(),
    communityId: z.string().nullable().optional(),
    isActive: z.boolean(),
    memberCount: z.number(),
    participants: z.array(z.object({
      userId: z.string(),
      role: userRoleEnum,
      joinedAt: z.string().datetime(),
      isActive: z.boolean(),
      permissions: z.object({
        canInvite: z.boolean(),
        canRemove: z.boolean(),
        canEdit: z.boolean(),
        canDelete: z.boolean(),
        canModerate: z.boolean(),
      }).nullable().optional(),
    })).optional(),
    lastMessage: messageMinimalSchema.nullable().optional(),
    lastMessageAt: z.string().datetime().nullable().optional(),
    messageCount: z.number().nullable().optional(),
    unreadCount: z.number().nullable().optional(),
    encryptionMode: encryptionModeEnum.nullable().optional(),
    encryptionEnabledAt: z.string().datetime().nullable().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    lastActivityAt: z.string().datetime().nullable().optional(),
    createdBy: z.string().nullable().optional(),
    createdByUser: UserSchemas.minimal.nullable().optional(),
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

// =============================================================================
// ATTACHMENT SCHEMAS
// =============================================================================

/**
 * Status de scan de fichier
 */
export const scanStatusEnum = z.enum(['pending', 'clean', 'infected', 'error']);

/**
 * Status de modération
 */
export const moderationStatusEnum = z.enum(['pending', 'approved', 'flagged', 'rejected']);

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
    scanCompletedAt: z.string().datetime().nullable().optional(),
    moderationStatus: moderationStatusEnum.nullable().optional(),
    moderationReason: z.string().nullable().optional(),

    // Delivery status
    deliveredToAllAt: z.string().datetime().nullable().optional(),
    viewedByAllAt: z.string().datetime().nullable().optional(),
    downloadedByAllAt: z.string().datetime().nullable().optional(),
    viewedCount: z.number().optional(),
    downloadedCount: z.number().optional(),

    // Encryption
    isEncrypted: z.boolean().optional(),
    encryptionMode: encryptionModeEnum.nullable().optional(),

    // Timestamps
    createdAt: z.string().datetime(),
    metadata: z.record(z.unknown()).nullable().optional(),
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
    createdAt: z.string().datetime(),
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
    emoji: z.string().min(1).max(10),
  }),
};

// =============================================================================
// MENTION SCHEMAS
// =============================================================================

/**
 * Schémas pour les mentions
 */
export const MentionSchemas = {
  // Mention complète
  full: z.object({
    id: z.string(),
    messageId: z.string(),
    mentionedUserId: z.string(),
    mentionedAt: z.string().datetime(),
    mentionedUser: UserSchemas.minimal,
  }),
};

// =============================================================================
// FRIEND REQUEST SCHEMAS
// =============================================================================

/**
 * Statut de demande d'ami
 */
export const friendRequestStatusEnum = z.enum(['pending', 'accepted', 'rejected', 'blocked']);

/**
 * Schémas pour les demandes d'ami
 */
export const FriendRequestSchemas = {
  // Demande d'ami complète
  full: z.object({
    id: z.string(),
    senderId: z.string(),
    receiverId: z.string(),
    message: z.string().nullable().optional(),
    status: friendRequestStatusEnum,
    respondedAt: z.string().datetime().nullable().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    sender: UserSchemas.minimal.optional(),
    receiver: UserSchemas.minimal.optional(),
  }),

  // Envoyer une demande
  send: z.object({
    receiverId: z.string().min(1),
    message: z.string().max(200).optional(),
  }),

  // Répondre à une demande
  respond: z.object({
    action: z.enum(['accept', 'reject', 'block']),
  }),
};

// =============================================================================
// NOTIFICATION SCHEMAS
// =============================================================================

/**
 * Types de notification
 * Valeurs complètes pour toutes les fonctionnalités du site
 *
 * Catégories:
 * - Messages: notifications liées aux messages
 * - Conversations: création, invitation, modifications
 * - Membres: rejoindre, quitter, promotions
 * - Contacts: demandes d'amis, acceptations
 * - Interactions: mentions, réactions
 * - Appels: manqués, entrants, terminés
 * - Traduction: transcriptions, traductions audio
 * - Sécurité: connexions, changements de mot de passe
 * - Modération: signalements, contenus supprimés
 * - Système: maintenance, annonces
 */
export const notificationTypeEnum = z.enum([
  // ===== MESSAGE EVENTS =====
  'new_message',           // Nouveau message reçu
  'message_reply',         // Réponse à votre message
  'message_edited',        // Message modifié
  'message_deleted',       // Message supprimé
  'message_pinned',        // Message épinglé
  'message_unpinned',      // Message désépinglé
  'message_forwarded',     // Message transféré

  // ===== CONVERSATION EVENTS =====
  'new_conversation',          // Nouvelle conversation (générique)
  'new_conversation_direct',   // Nouvelle conversation directe
  'new_conversation_group',    // Invitation à un groupe
  'conversation_archived',     // Conversation archivée
  'conversation_unarchived',   // Conversation désarchivée
  'conversation_deleted',      // Conversation supprimée
  'conversation_settings_changed', // Paramètres de conversation modifiés
  'added_to_conversation',     // Ajouté à une conversation
  'removed_from_conversation', // Retiré d'une conversation
  'conversation_encryption_enabled', // Chiffrement E2EE activé

  // ===== MEMBER/GROUP EVENTS =====
  'member_joined',        // Nouveau membre dans le groupe
  'member_left',          // Membre a quitté le groupe
  'member_removed',       // Membre retiré du groupe
  'member_promoted',      // Membre promu (admin/modérateur)
  'member_demoted',       // Membre rétrogradé
  'member_role_changed',  // Rôle de membre modifié

  // ===== CONTACT/FRIEND EVENTS =====
  'contact_request',      // Demande de contact reçue
  'contact_accepted',     // Demande de contact acceptée
  'contact_rejected',     // Demande de contact refusée
  'contact_blocked',      // Contact bloqué
  'contact_unblocked',    // Contact débloqué
  'friend_request',       // Alias pour contact_request
  'friend_accepted',      // Alias pour contact_accepted

  // ===== INTERACTION EVENTS =====
  'user_mentioned',       // Mentionné dans un message (@username)
  'mention',              // Alias pour user_mentioned
  'message_reaction',     // Réaction emoji à votre message
  'reaction',             // Alias pour message_reaction

  // ===== CALL EVENTS =====
  'missed_call',          // Appel manqué
  'incoming_call',        // Appel entrant
  'call_ended',           // Appel terminé
  'call_declined',        // Appel refusé
  'call_recording_ready', // Enregistrement d'appel disponible

  // ===== TRANSLATION/AUDIO EVENTS =====
  'translation_completed',    // Traduction terminée
  'translation_failed',       // Échec de traduction
  'transcription_completed',  // Transcription audio terminée
  'transcription_failed',     // Échec de transcription
  'voice_clone_ready',        // Modèle vocal prêt
  'voice_clone_failed',       // Échec du clonage vocal
  'audio_message_translated', // Message audio traduit

  // ===== SECURITY/ACCOUNT EVENTS =====
  'login_new_device',         // Connexion depuis un nouvel appareil
  'login_suspicious',         // Activité de connexion suspecte
  'password_changed',         // Mot de passe modifié
  'password_reset_requested', // Demande de réinitialisation
  'email_verified',           // Email vérifié
  'phone_verified',           // Téléphone vérifié
  'two_factor_enabled',       // 2FA activé
  'two_factor_disabled',      // 2FA désactivé
  'session_expired',          // Session expirée
  'account_locked',           // Compte verrouillé
  'account_unlocked',         // Compte déverrouillé

  // ===== MODERATION EVENTS =====
  'content_flagged',          // Contenu signalé
  'content_removed',          // Contenu supprimé par modération
  'report_submitted',         // Signalement envoyé
  'report_resolved',          // Signalement traité
  'warning_received',         // Avertissement reçu

  // ===== FILE/ATTACHMENT EVENTS =====
  'file_shared',              // Fichier partagé avec vous
  'file_upload_completed',    // Upload de fichier terminé
  'file_upload_failed',       // Échec d'upload
  'file_scan_completed',      // Scan antivirus terminé

  // ===== COMMUNITY EVENTS =====
  'community_invite',         // Invitation à une communauté
  'community_joined',         // Rejoint une communauté
  'community_left',           // Quitté une communauté
  'community_announcement',   // Annonce de communauté
  'community_role_changed',   // Rôle changé dans la communauté

  // ===== SYSTEM EVENTS =====
  'system',                   // Notification système générique
  'maintenance',              // Maintenance planifiée
  'update_available',         // Mise à jour disponible
  'feature_announcement',     // Nouvelle fonctionnalité
  'terms_updated',            // Conditions d'utilisation mises à jour
  'privacy_updated',          // Politique de confidentialité mise à jour

  // ===== ENGAGEMENT/GAMIFICATION =====
  'achievement_unlocked',     // Succès débloqué
  'streak_milestone',         // Jalon de streak atteint
  'level_up',                 // Niveau augmenté
  'badge_earned',             // Badge gagné

  // ===== PAYMENT/SUBSCRIPTION (future) =====
  'subscription_expiring',    // Abonnement expire bientôt
  'subscription_renewed',     // Abonnement renouvelé
  'payment_received',         // Paiement reçu
  'payment_failed',           // Échec de paiement
]);

/**
 * Priorité de notification
 */
export const notificationPriorityEnum = z.enum(['low', 'normal', 'high', 'urgent']);

/**
 * Schémas pour les notifications
 */
export const NotificationSchemas = {
  // Notification complète
  full: z.object({
    id: z.string(),
    userId: z.string(),
    type: notificationTypeEnum,
    title: z.string(),
    content: z.string(),
    data: z.string().nullable().optional(),
    priority: notificationPriorityEnum,
    isRead: z.boolean(),
    readAt: z.string().datetime().nullable().optional(),
    emailSent: z.boolean(),
    pushSent: z.boolean(),
    expiresAt: z.string().datetime().nullable().optional(),
    createdAt: z.string().datetime(),

    // Sender info
    senderId: z.string().nullable().optional(),
    senderUsername: z.string().nullable().optional(),
    senderAvatar: z.string().nullable().optional(),
    senderDisplayName: z.string().nullable().optional(),
    messagePreview: z.string().nullable().optional(),

    // References
    conversationId: z.string().nullable().optional(),
    messageId: z.string().nullable().optional(),
    callSessionId: z.string().nullable().optional(),
  }),

  // Notification minimale
  minimal: z.object({
    id: z.string(),
    type: notificationTypeEnum,
    title: z.string(),
    content: z.string(),
    isRead: z.boolean(),
    createdAt: z.string().datetime(),
  }),

  // Marquer comme lu
  markRead: z.object({
    notificationIds: z.array(z.string()).min(1).optional(),
    all: z.boolean().optional(),
  }),
};

/**
 * Schémas pour les préférences de notification
 */
export const NotificationPreferenceSchemas = {
  // Préférences complètes
  full: z.object({
    id: z.string(),
    userId: z.string(),

    // Global toggles
    pushEnabled: z.boolean(),
    emailEnabled: z.boolean(),
    soundEnabled: z.boolean(),

    // Per-type
    newMessageEnabled: z.boolean(),
    missedCallEnabled: z.boolean(),
    systemEnabled: z.boolean(),
    conversationEnabled: z.boolean(),
    replyEnabled: z.boolean(),
    mentionEnabled: z.boolean(),
    reactionEnabled: z.boolean(),
    contactRequestEnabled: z.boolean(),
    memberJoinedEnabled: z.boolean(),

    // DND
    dndEnabled: z.boolean(),
    dndStartTime: z.string().nullable().optional(),
    dndEndTime: z.string().nullable().optional(),

    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),

  // Mise à jour des préférences
  update: z.object({
    pushEnabled: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
    soundEnabled: z.boolean().optional(),
    newMessageEnabled: z.boolean().optional(),
    missedCallEnabled: z.boolean().optional(),
    systemEnabled: z.boolean().optional(),
    conversationEnabled: z.boolean().optional(),
    replyEnabled: z.boolean().optional(),
    mentionEnabled: z.boolean().optional(),
    reactionEnabled: z.boolean().optional(),
    contactRequestEnabled: z.boolean().optional(),
    memberJoinedEnabled: z.boolean().optional(),
    dndEnabled: z.boolean().optional(),
    dndStartTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
    dndEndTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  }),
};

// =============================================================================
// COMMUNITY SCHEMAS
// =============================================================================

/**
 * Rôle dans une communauté
 */
export const communityRoleEnum = z.enum(['admin', 'moderator', 'member']);

/**
 * Schémas pour les communautés
 */
export const CommunitySchemas = {
  // Communauté complète
  full: z.object({
    id: z.string(),
    identifier: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
    banner: z.string().nullable().optional(),
    isPrivate: z.boolean(),
    isActive: z.boolean(),
    deletedAt: z.string().datetime().nullable().optional(),
    createdBy: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    creator: UserSchemas.minimal.optional(),
    memberCount: z.number().optional(),
    conversationCount: z.number().optional(),
  }),

  // Communauté minimale
  minimal: z.object({
    id: z.string(),
    identifier: z.string(),
    name: z.string(),
    avatar: z.string().nullable().optional(),
    isPrivate: z.boolean(),
    memberCount: z.number().optional(),
  }),

  // Membre de communauté
  member: z.object({
    id: z.string(),
    communityId: z.string(),
    userId: z.string(),
    joinedAt: z.string().datetime(),
    role: communityRoleEnum,
    isActive: z.boolean(),
    leftAt: z.string().datetime().nullable().optional(),
    user: UserSchemas.minimal.optional(),
  }),

  // Créer une communauté
  create: z.object({
    name: z.string().min(1).max(100),
    identifier: z.string().min(1).max(50).regex(/^[a-zA-Z0-9\-_]+$/).optional(),
    description: z.string().max(500).optional(),
    isPrivate: z.boolean().default(true),
  }),

  // Mettre à jour une communauté
  update: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    avatar: z.string().url().optional(),
    banner: z.string().url().optional(),
    isPrivate: z.boolean().optional(),
  }),

  // Ajouter un membre
  addMember: z.object({
    userId: z.string().min(1),
    role: communityRoleEnum.optional(),
  }),

  // Changer le rôle d'un membre
  updateMemberRole: z.object({
    role: communityRoleEnum,
  }),
};

// =============================================================================
// CALL SESSION SCHEMAS
// =============================================================================

/**
 * Mode d'appel
 */
export const callModeEnum = z.enum(['voice', 'video']);

/**
 * Type d'appel (alias pour compatibilité gateway)
 * Utilise 'audio' au lieu de 'voice' pour cohérence avec WebRTC
 */
export const callTypeEnum = z.enum(['audio', 'video']);

/**
 * Statut d'appel
 */
export const callStatusEnum = z.enum(['ringing', 'active', 'ended', 'missed', 'rejected', 'failed']);

/**
 * Rôle de participant d'appel
 */
export const callParticipantRoleEnum = z.enum(['initiator', 'participant', 'observer']);

/**
 * Statut de participant d'appel
 */
export const callParticipantStatusEnum = z.enum(['invited', 'ringing', 'connected', 'disconnected', 'declined']);

/**
 * Schémas pour les sessions d'appel
 */
export const CallSessionSchemas = {
  // Session complète
  full: z.object({
    id: z.string(),
    conversationId: z.string(),
    initiatorId: z.string(),
    mode: callModeEnum,
    status: callStatusEnum,
    startedAt: z.string().datetime().nullable().optional(),
    endedAt: z.string().datetime().nullable().optional(),
    duration: z.number().nullable().optional(),
    isRecorded: z.boolean(),
    recordingUrl: z.string().nullable().optional(),
    isTranscribed: z.boolean(),
    transcriptionId: z.string().nullable().optional(),
    averageQuality: z.number().nullable().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    initiator: UserSchemas.minimal.optional(),
    participantCount: z.number().optional(),
  }),

  // Session minimale
  minimal: z.object({
    id: z.string(),
    mode: callModeEnum,
    status: callStatusEnum,
    startedAt: z.string().datetime().nullable().optional(),
    duration: z.number().nullable().optional(),
    participantCount: z.number().optional(),
  }),

  // Démarrer un appel
  start: z.object({
    conversationId: z.string().min(1),
    mode: callModeEnum,
    participantIds: z.array(z.string()).optional(),
  }),
};

/**
 * Schémas pour les participants d'appel
 */
export const CallParticipantSchemas = {
  // Participant complet
  full: z.object({
    id: z.string(),
    callSessionId: z.string(),
    userId: z.string(),
    role: callParticipantRoleEnum,
    status: callParticipantStatusEnum,
    joinedAt: z.string().datetime().nullable().optional(),
    leftAt: z.string().datetime().nullable().optional(),
    duration: z.number().nullable().optional(),
    isMuted: z.boolean(),
    isVideoOff: z.boolean(),
    connectionQuality: z.number().nullable().optional(),
    user: UserSchemas.minimal.optional(),
  }),
};

// =============================================================================
// REPORT SCHEMAS
// =============================================================================

/**
 * Type de rapport
 */
export const reportTypeEnum = z.enum(['spam', 'harassment', 'inappropriate_content', 'impersonation', 'other']);

/**
 * Type de cible de rapport
 */
export const reportTargetTypeEnum = z.enum(['user', 'message', 'conversation', 'community']);

/**
 * Statut de rapport
 */
export const reportStatusEnum = z.enum(['pending', 'investigating', 'resolved', 'dismissed']);

/**
 * Schémas pour les rapports
 */
export const ReportSchemas = {
  // Rapport complet
  full: z.object({
    id: z.string(),
    reporterId: z.string(),
    reportType: reportTypeEnum,
    targetType: reportTargetTypeEnum,
    targetId: z.string(),
    reason: z.string(),
    evidence: z.string().nullable().optional(),
    status: reportStatusEnum,
    resolution: z.string().nullable().optional(),
    resolvedBy: z.string().nullable().optional(),
    resolvedAt: z.string().datetime().nullable().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    reporter: UserSchemas.minimal.optional(),
  }),

  // Créer un rapport
  create: z.object({
    reportType: reportTypeEnum,
    targetType: reportTargetTypeEnum,
    targetId: z.string().min(1),
    reason: z.string().min(10).max(1000),
    evidence: z.string().max(5000).optional(),
  }),

  // Mettre à jour le statut (admin)
  updateStatus: z.object({
    status: reportStatusEnum,
    resolution: z.string().max(1000).optional(),
  }),
};

// =============================================================================
// USER STATS SCHEMAS
// =============================================================================

/**
 * Schémas pour les statistiques utilisateur
 */
export const UserStatsSchemas = {
  // Stats complètes
  full: z.object({
    id: z.string(),
    userId: z.string(),

    // Message stats
    totalMessagesSent: z.number(),
    totalMessagesReceived: z.number(),
    messagesThisWeek: z.number(),
    messagesThisMonth: z.number(),

    // Conversation stats
    totalConversations: z.number(),
    activeConversations: z.number(),
    publicConversationsCreated: z.number(),

    // Call stats
    totalCallsInitiated: z.number(),
    totalCallsReceived: z.number(),
    totalCallDuration: z.number(),

    // Translation stats
    totalTranslationsRequested: z.number(),
    topLanguagesPaired: z.string().nullable().optional(),

    // Social stats
    totalFriends: z.number(),
    communitiesJoined: z.number(),
    communitiesCreated: z.number(),

    // Engagement
    averageResponseTime: z.number().nullable().optional(),
    lastActiveAt: z.string().datetime().nullable().optional(),
    streakDays: z.number(),

    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),
};

// =============================================================================
// AUDIO TRANSCRIPTION SCHEMAS
// =============================================================================

/**
 * Statut de transcription/traduction audio
 */
export const audioProcessingStatusEnum = z.enum(['pending', 'processing', 'completed', 'failed']);

/**
 * Statut de modèle vocal
 */
export const voiceModelStatusEnum = z.enum(['training', 'ready', 'failed', 'deleted']);

/**
 * Schémas pour la transcription audio
 */
export const AudioTranscriptionSchemas = {
  // Transcription complète
  full: z.object({
    id: z.string(),
    messageId: z.string(),
    attachmentId: z.string().nullable().optional(),
    sourceLanguage: z.string(),
    transcriptionText: z.string(),
    confidence: z.number().min(0).max(1).nullable().optional(),
    duration: z.number().nullable().optional(),
    model: z.string().nullable().optional(),
    status: audioProcessingStatusEnum,
    errorMessage: z.string().nullable().optional(),
    createdAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable().optional(),
  }),

  // Demander une transcription
  request: z.object({
    messageId: z.string().min(1),
    attachmentId: z.string().optional(),
  }),
};

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
    createdAt: z.string().datetime(),
  }),

  // Demander une traduction audio
  request: z.object({
    transcriptionId: z.string().min(1),
    targetLanguage: z.string().min(2).max(5),
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
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),

  // Créer un modèle vocal
  create: z.object({
    name: z.string().min(1).max(100),
    language: z.string().min(2).max(5),
    isPublic: z.boolean().default(false),
  }),

  // Mettre à jour un modèle vocal
  update: z.object({
    name: z.string().min(1).max(100).optional(),
    isDefault: z.boolean().optional(),
    isPublic: z.boolean().optional(),
  }),
};

// =============================================================================
// CONVERSATION READ CURSOR SCHEMAS
// =============================================================================

/**
 * Schémas pour les curseurs de lecture
 */
export const ReadCursorSchemas = {
  // Curseur de lecture
  full: z.object({
    id: z.string(),
    conversationId: z.string(),
    userId: z.string(),
    lastReadMessageId: z.string().nullable().optional(),
    lastReadAt: z.string().datetime(),
    unreadCount: z.number(),
  }),

  // Mettre à jour le curseur
  update: z.object({
    lastReadMessageId: z.string().min(1),
  }),
};

// =============================================================================
// ADMIN AUDIT LOG SCHEMAS
// =============================================================================

/**
 * Actions d'audit admin
 */
export const adminActionEnum = z.enum([
  'user_ban', 'user_unban', 'user_delete', 'user_role_change',
  'content_delete', 'content_flag', 'content_approve',
  'report_resolve', 'report_dismiss',
  'community_delete', 'community_suspend',
  'settings_change', 'system_config'
]);

/**
 * Type cible d'audit
 */
export const auditTargetTypeEnum = z.enum(['user', 'message', 'conversation', 'community', 'report', 'system']);

/**
 * Schémas pour les logs d'audit admin
 */
export const AdminAuditLogSchemas = {
  // Log complet
  full: z.object({
    id: z.string(),
    adminId: z.string(),
    action: adminActionEnum,
    targetType: auditTargetTypeEnum,
    targetId: z.string().nullable().optional(),
    details: z.string().nullable().optional(),
    previousState: z.string().nullable().optional(),
    newState: z.string().nullable().optional(),
    ipAddress: z.string().nullable().optional(),
    userAgent: z.string().nullable().optional(),
    createdAt: z.string().datetime(),
    admin: UserSchemas.minimal.optional(),
  }),

  // Filtres de recherche
  search: z.object({
    adminId: z.string().optional(),
    action: adminActionEnum.optional(),
    targetType: auditTargetTypeEnum.optional(),
    targetId: z.string().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
};

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
    resolvedAt: z.string().datetime().nullable().optional(),
    resolvedBy: z.string().nullable().optional(),
    createdAt: z.string().datetime(),
  }),

  // Filtres de recherche
  search: z.object({
    userId: z.string().optional(),
    eventType: securityEventTypeEnum.optional(),
    severity: securitySeverityEnum.optional(),
    isResolved: z.boolean().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
};

// =============================================================================
// AFFILIATE SCHEMAS
// =============================================================================

/**
 * Types de token affiliate
 */
export const affiliateTokenTypeEnum = z.enum(['referral', 'promo', 'partner', 'influencer']);

/**
 * Statut de relation affiliate
 */
export const affiliateRelationStatusEnum = z.enum(['pending', 'active', 'expired', 'revoked']);

/**
 * Schémas pour les tokens affiliate
 */
export const AffiliateTokenSchemas = {
  // Token complet
  full: z.object({
    id: z.string(),
    userId: z.string(),
    token: z.string(),
    type: affiliateTokenTypeEnum,
    description: z.string().nullable().optional(),
    commission: z.number().nullable().optional(),
    maxUses: z.number().nullable().optional(),
    currentUses: z.number(),
    isActive: z.boolean(),
    expiresAt: z.string().datetime().nullable().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),

  // Créer un token
  create: z.object({
    type: affiliateTokenTypeEnum,
    description: z.string().max(500).optional(),
    commission: z.number().min(0).max(100).optional(),
    maxUses: z.number().min(1).optional(),
    expiresAt: z.string().datetime().optional(),
  }),
};

/**
 * Schémas pour les relations affiliate
 */
export const AffiliateRelationSchemas = {
  // Relation complète
  full: z.object({
    id: z.string(),
    affiliateId: z.string(),
    referredUserId: z.string(),
    tokenId: z.string(),
    status: affiliateRelationStatusEnum,
    earnings: z.number(),
    createdAt: z.string().datetime(),
    affiliate: UserSchemas.minimal.optional(),
    referredUser: UserSchemas.minimal.optional(),
  }),
};

// =============================================================================
// TRACKING LINK SCHEMAS
// =============================================================================

/**
 * Schémas pour les liens de tracking
 */
export const TrackingLinkSchemas = {
  // Lien complet
  full: z.object({
    id: z.string(),
    userId: z.string(),
    shortCode: z.string(),
    destinationUrl: z.string(),
    title: z.string().nullable().optional(),
    campaign: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
    medium: z.string().nullable().optional(),
    totalClicks: z.number(),
    uniqueClicks: z.number(),
    isActive: z.boolean(),
    expiresAt: z.string().datetime().nullable().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),

  // Créer un lien
  create: z.object({
    destinationUrl: z.string().url(),
    shortCode: z.string().min(3).max(20).regex(/^[a-zA-Z0-9-_]+$/).optional(),
    title: z.string().max(100).optional(),
    campaign: z.string().max(50).optional(),
    source: z.string().max(50).optional(),
    medium: z.string().max(50).optional(),
    expiresAt: z.string().datetime().optional(),
  }),
};

/**
 * Schémas pour les clics de tracking
 */
export const TrackingLinkClickSchemas = {
  // Clic complet
  full: z.object({
    id: z.string(),
    linkId: z.string(),
    ipAddress: z.string().nullable().optional(),
    userAgent: z.string().nullable().optional(),
    referrer: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    deviceType: z.string().nullable().optional(),
    browser: z.string().nullable().optional(),
    os: z.string().nullable().optional(),
    isUnique: z.boolean(),
    createdAt: z.string().datetime(),
  }),
};

// =============================================================================
// ANONYMOUS PARTICIPANT SCHEMAS
// =============================================================================

/**
 * Schémas pour les participants anonymes
 */
export const AnonymousParticipantSchemas = {
  // Participant complet
  full: z.object({
    id: z.string(),
    conversationId: z.string(),
    sessionId: z.string(),
    nickname: z.string().nullable().optional(),
    language: z.string(),
    email: z.string().email().nullable().optional(),
    avatarColor: z.string().nullable().optional(),
    isActive: z.boolean(),
    lastActiveAt: z.string().datetime().nullable().optional(),
    ipAddress: z.string().nullable().optional(),
    userAgent: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    messageCount: z.number(),
    createdAt: z.string().datetime(),
  }),

  // Rejoindre en anonyme
  join: z.object({
    nickname: z.string().min(2).max(30).optional(),
    language: z.string().min(2).max(5).default('fr'),
    email: z.string().email().optional(),
  }),
};

// =============================================================================
// USER PREFERENCE SCHEMAS
// =============================================================================

/**
 * Thème de l'application
 */
export const themeEnum = z.enum(['light', 'dark', 'system']);

/**
 * Taille de police
 */
export const fontSizeEnum = z.enum(['small', 'medium', 'large']);

/**
 * Qualité média
 */
export const mediaQualityEnum = z.enum(['low', 'medium', 'high', 'original']);

/**
 * Schémas pour les préférences utilisateur
 */
export const UserPreferenceSchemas = {
  // Préférences complètes
  full: z.object({
    id: z.string(),
    userId: z.string(),

    // Theme & Display
    theme: themeEnum,
    fontSize: fontSizeEnum,
    compactMode: z.boolean(),

    // Privacy
    showOnlineStatus: z.boolean(),
    showLastSeen: z.boolean(),
    showReadReceipts: z.boolean(),
    showTypingIndicator: z.boolean(),

    // Media
    autoPlayMedia: z.boolean(),
    autoDownloadMedia: z.boolean(),
    mediaQuality: mediaQualityEnum,

    // Keyboard
    enterToSend: z.boolean(),

    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),

  // Mettre à jour les préférences
  update: z.object({
    theme: themeEnum.optional(),
    fontSize: fontSizeEnum.optional(),
    compactMode: z.boolean().optional(),
    showOnlineStatus: z.boolean().optional(),
    showLastSeen: z.boolean().optional(),
    showReadReceipts: z.boolean().optional(),
    showTypingIndicator: z.boolean().optional(),
    autoPlayMedia: z.boolean().optional(),
    autoDownloadMedia: z.boolean().optional(),
    mediaQuality: mediaQualityEnum.optional(),
    enterToSend: z.boolean().optional(),
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

/**
 * Types inférés depuis les schemas Zod
 * Préfixés avec "V" pour "Validated" afin d'éviter les conflits
 * avec les types existants dans conversation.ts et api-schemas.ts
 */
export type VUserPermissions = z.infer<typeof UserSchemas.permissions>;
export type VUserMinimal = z.infer<typeof UserSchemas.minimal>;
export type VUserFull = z.infer<typeof UserSchemas.full>;
export type VUserUpdate = z.infer<typeof UserSchemas.update>;

export type VLoginRequest = z.infer<typeof AuthSchemas.login>;
export type VRegisterRequest = z.infer<typeof AuthSchemas.register>;
export type VVerifyEmailRequest = z.infer<typeof AuthSchemas.verifyEmail>;
export type VVerifyPhoneRequest = z.infer<typeof AuthSchemas.verifyPhone>;
export type VChangePasswordRequest = z.infer<typeof AuthSchemas.changePassword>;
export type VResetPasswordRequest = z.infer<typeof AuthSchemas.resetPassword>;

export type VSessionMinimal = z.infer<typeof SessionSchemas.minimal>;
export type VSessionFull = z.infer<typeof SessionSchemas.full>;

export type VMessageTranslation = z.infer<typeof MessageSchemas.translation>;
export type VAnonymousSender = z.infer<typeof MessageSchemas.anonymousSender>;
export type VMessageMinimal = z.infer<typeof MessageSchemas.minimal>;
export type VMessageFull = z.infer<typeof MessageSchemas.full>;
export type VSendMessageRequest = z.infer<typeof MessageSchemas.send>;
export type VEditMessageRequest = z.infer<typeof MessageSchemas.edit>;

export type VConversationParticipant = z.infer<typeof ConversationSchemas.participant>;
export type VConversationSettings = z.infer<typeof ConversationSchemas.settings>;
export type VConversationLink = z.infer<typeof ConversationSchemas.link>;
export type VConversationStats = z.infer<typeof ConversationSchemas.stats>;
export type VConversationMinimal = z.infer<typeof ConversationSchemas.minimal>;
export type VConversationFull = z.infer<typeof ConversationSchemas.full>;
export type VCreateConversationRequest = z.infer<typeof ConversationSchemas.create>;
export type VUpdateConversationRequest = z.infer<typeof ConversationSchemas.update>;

export type VUserRole = z.infer<typeof userRoleEnum>;
export type VMessageType = z.infer<typeof messageTypeEnum>;
export type VMessageSource = z.infer<typeof messageSourceEnum>;
export type VEncryptionMode = z.infer<typeof encryptionModeEnum>;
export type VTranslationModel = z.infer<typeof translationModelEnum>;
export type VConversationType = z.infer<typeof conversationTypeEnum>;
export type VConversationStatus = z.infer<typeof conversationStatusEnum>;
export type VConversationVisibility = z.infer<typeof conversationVisibilityEnum>;
export type VConversationLinkType = z.infer<typeof conversationLinkTypeEnum>;

// User profile update types
export type VUpdateUserProfile = z.infer<typeof updateUserProfileSchema>;
export type VUpdateAvatar = z.infer<typeof updateAvatarSchema>;
export type VUpdatePassword = z.infer<typeof updatePasswordSchema>;
export type VUpdateUsername = z.infer<typeof updateUsernameSchema>;

// Attachment types
export type VScanStatus = z.infer<typeof scanStatusEnum>;
export type VModerationStatus = z.infer<typeof moderationStatusEnum>;
export type VAttachmentMinimal = z.infer<typeof AttachmentSchemas.minimal>;
export type VAttachmentFull = z.infer<typeof AttachmentSchemas.full>;
export type VAttachmentUpload = z.infer<typeof AttachmentSchemas.upload>;

// Reaction types
export type VReactionFull = z.infer<typeof ReactionSchemas.full>;
export type VReactionSummary = z.infer<typeof ReactionSchemas.summary>;
export type VReactionAdd = z.infer<typeof ReactionSchemas.add>;

// Mention types
export type VMentionFull = z.infer<typeof MentionSchemas.full>;

// Friend request types
export type VFriendRequestStatus = z.infer<typeof friendRequestStatusEnum>;
export type VFriendRequestFull = z.infer<typeof FriendRequestSchemas.full>;
export type VFriendRequestSend = z.infer<typeof FriendRequestSchemas.send>;
export type VFriendRequestRespond = z.infer<typeof FriendRequestSchemas.respond>;

// Notification types
export type VNotificationType = z.infer<typeof notificationTypeEnum>;
export type VNotificationPriority = z.infer<typeof notificationPriorityEnum>;
export type VNotificationFull = z.infer<typeof NotificationSchemas.full>;
export type VNotificationMinimal = z.infer<typeof NotificationSchemas.minimal>;
export type VNotificationMarkRead = z.infer<typeof NotificationSchemas.markRead>;
export type VNotificationPreferenceFull = z.infer<typeof NotificationPreferenceSchemas.full>;
export type VNotificationPreferenceUpdate = z.infer<typeof NotificationPreferenceSchemas.update>;

// Community types
export type VCommunityRole = z.infer<typeof communityRoleEnum>;
export type VCommunityFull = z.infer<typeof CommunitySchemas.full>;
export type VCommunityMinimal = z.infer<typeof CommunitySchemas.minimal>;
export type VCommunityMember = z.infer<typeof CommunitySchemas.member>;
export type VCommunityCreate = z.infer<typeof CommunitySchemas.create>;
export type VCommunityUpdate = z.infer<typeof CommunitySchemas.update>;
export type VCommunityAddMember = z.infer<typeof CommunitySchemas.addMember>;
export type VCommunityUpdateMemberRole = z.infer<typeof CommunitySchemas.updateMemberRole>;

// Call session types
export type VCallMode = z.infer<typeof callModeEnum>;
export type VCallType = z.infer<typeof callTypeEnum>;
export type VCallStatus = z.infer<typeof callStatusEnum>;
export type VCallParticipantRole = z.infer<typeof callParticipantRoleEnum>;
export type VCallParticipantStatus = z.infer<typeof callParticipantStatusEnum>;
export type VCallSessionFull = z.infer<typeof CallSessionSchemas.full>;
export type VCallSessionMinimal = z.infer<typeof CallSessionSchemas.minimal>;
export type VCallSessionStart = z.infer<typeof CallSessionSchemas.start>;
export type VCallParticipantFull = z.infer<typeof CallParticipantSchemas.full>;

// Report types
export type VReportType = z.infer<typeof reportTypeEnum>;
export type VReportTargetType = z.infer<typeof reportTargetTypeEnum>;
export type VReportStatus = z.infer<typeof reportStatusEnum>;
export type VReportFull = z.infer<typeof ReportSchemas.full>;
export type VReportCreate = z.infer<typeof ReportSchemas.create>;
export type VReportUpdateStatus = z.infer<typeof ReportSchemas.updateStatus>;

// User stats types
export type VUserStatsFull = z.infer<typeof UserStatsSchemas.full>;

// Audio transcription types
export type VAudioProcessingStatus = z.infer<typeof audioProcessingStatusEnum>;
export type VVoiceModelStatus = z.infer<typeof voiceModelStatusEnum>;
export type VAudioTranscriptionFull = z.infer<typeof AudioTranscriptionSchemas.full>;
export type VAudioTranscriptionRequest = z.infer<typeof AudioTranscriptionSchemas.request>;
export type VTranslatedAudioFull = z.infer<typeof TranslatedAudioSchemas.full>;
export type VTranslatedAudioRequest = z.infer<typeof TranslatedAudioSchemas.request>;
export type VVoiceModelFull = z.infer<typeof VoiceModelSchemas.full>;
export type VVoiceModelCreate = z.infer<typeof VoiceModelSchemas.create>;
export type VVoiceModelUpdate = z.infer<typeof VoiceModelSchemas.update>;

// Read cursor types
export type VReadCursorFull = z.infer<typeof ReadCursorSchemas.full>;
export type VReadCursorUpdate = z.infer<typeof ReadCursorSchemas.update>;

// Admin audit log types
export type VAdminAction = z.infer<typeof adminActionEnum>;
export type VAuditTargetType = z.infer<typeof auditTargetTypeEnum>;
export type VAdminAuditLogFull = z.infer<typeof AdminAuditLogSchemas.full>;
export type VAdminAuditLogSearch = z.infer<typeof AdminAuditLogSchemas.search>;

// Security event types
export type VSecurityEventType = z.infer<typeof securityEventTypeEnum>;
export type VSecuritySeverity = z.infer<typeof securitySeverityEnum>;
export type VSecurityStatus = z.infer<typeof securityStatusEnum>;
export type VSecurityEventFull = z.infer<typeof SecurityEventSchemas.full>;
export type VSecurityEventSearch = z.infer<typeof SecurityEventSchemas.search>;

// Affiliate types
export type VAffiliateTokenType = z.infer<typeof affiliateTokenTypeEnum>;
export type VAffiliateRelationStatus = z.infer<typeof affiliateRelationStatusEnum>;
export type VAffiliateTokenFull = z.infer<typeof AffiliateTokenSchemas.full>;
export type VAffiliateTokenCreate = z.infer<typeof AffiliateTokenSchemas.create>;
export type VAffiliateRelationFull = z.infer<typeof AffiliateRelationSchemas.full>;

// Tracking link types
export type VTrackingLinkFull = z.infer<typeof TrackingLinkSchemas.full>;
export type VTrackingLinkCreate = z.infer<typeof TrackingLinkSchemas.create>;
export type VTrackingLinkClickFull = z.infer<typeof TrackingLinkClickSchemas.full>;

// Anonymous participant types
export type VAnonymousParticipantFull = z.infer<typeof AnonymousParticipantSchemas.full>;
export type VAnonymousParticipantJoin = z.infer<typeof AnonymousParticipantSchemas.join>;

// User preference types
export type VTheme = z.infer<typeof themeEnum>;
export type VFontSize = z.infer<typeof fontSizeEnum>;
export type VMediaQuality = z.infer<typeof mediaQualityEnum>;
export type VUserPreferenceFull = z.infer<typeof UserPreferenceSchemas.full>;
export type VUserPreferenceUpdate = z.infer<typeof UserPreferenceSchemas.update>;
