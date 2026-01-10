/**
 * Types partagés Meeshy - Index principal
 * 
 * Centralise tous les types utilisés à travers l'application
 * Gateway, Frontend, et Translator
 */

// ===== NOUVEAUX TYPES UNIFIÉS =====
// Export des types unifiés Phase 1
export * from './conversation.js';
export * from './user.js';
export * from './anonymous.js';
export * from './api-responses.js';
export * from './api-schemas.js';
export * from './migration-utils.js';

// Import pour usage interne
import type { AnonymousParticipant } from './anonymous.js';

// Message types are now consolidated - export only UIMessage and GatewayMessage to avoid conflicts with conversation.ts
export type { UIMessage, GatewayMessage } from './message-types.js';
export { gatewayToUIMessage, getDisplayContent, isTranslating, hasTranslation } from './message-types.js';

// Export des types unifiés Phase 2 - Messaging
export * from './messaging.js';

// Export des types unifiés Phase 3 - Affiliate
export * from './affiliate.js';

// Export des types unifiés Phase 4 - Tracking Links
export * from './tracking-link.js';

// Export des types unifiés Phase 5 - Attachments
export * from './attachment.js';

// Export des types unifiés Phase 6 - Video Calls
export * from './video-call.js';

// Export des types unifiés Phase 7 - Audio Effects Timeline
export * from './audio-effects-timeline.js';

// Export des types unifiés Phase 8 - Push Notifications
export * from './push-notification.js';

// NOTE: Les types de notifications sont dans /apps/web/types/notification.ts
// Ils ne sont pas dans /shared car ils utilisent des types frontend spécifiques
// Le backend doit importer NotificationType depuis le webapp si nécessaire

// Export des types communauté
export * from './community.js';

// Export des types réactions
export * from './reaction.js';

// Export des types mentions
export * from './mention.js';

// Export des types d'erreurs
export * from './errors.js';

// Export des types signalement
export * from './report.js';

// Export des types encryption (E2EE / Signal Protocol)
export * from './encryption.js';

// Export des types admin (audit logs, analytics, etc.)
export * from './admin.js';

// Export des types de sécurité (sessions, tokens, events)
export * from './security.js';

// Export des types Signal Protocol database (pre-key bundles, conversation keys)
export * from './signal-database.js';

// Export des types DMA interopérabilité (WhatsApp, Messenger)
export * from './dma.js';

// Export des types transcription audio et clonage vocal
export * from './audio-transcription.js';

// Export des types suppression de messages
export * from './message-deletion.js';

// Export des types notifications complètes (Prisma-aligned + frontend unified)
export {
  // Enums
  NotificationTypeEnum,
  NotificationPriorityEnum,

  // Type unions
  type NotificationType,
  type NotificationPriority,
  type NotificationConversationType,
  type NotificationAttachmentType,
  type NotificationAction,

  // Main interfaces
  type NotificationSender,
  type NotificationSenderInfo,
  type NotificationContext,
  type NotificationMetadata,
  type Notification,

  // DTOs
  type CreateNotificationDTO,
  type UpdateNotificationDTO,

  // Filters and pagination
  type NotificationFilters,
  type NotificationPaginationOptions,
  type NotificationCounts,
  type NotificationStats,
  type NotificationResponse,

  // Preferences
  type NotificationPreference,
  type NotificationPreferences,
  type CreateNotificationPreferenceDTO,
  type UpdateNotificationPreferenceDTO,

  // Push notifications
  type PushNotificationPayload,
  type PushNotificationResult,

  // Utility functions
  isNotificationExpired,
  isNotificationUnread,
  isDNDActive,
  isNotificationTypeEnabled,
  shouldSendNotification,
  getNotificationSender,
  getDefaultNotificationPreferences,
} from './notification.js';

// Legacy aliases for backwards compatibility
export type { Notification as PrismaNotification } from './notification.js';
export type { NotificationType as PrismaNotificationType } from './notification.js';

// Export des types de préférences utilisateur
export * from './user-preferences.js';

// Export des types Voice API
export * from './voice-api.js';

// ===== UTILITAIRES PARTAGÉS =====
export * from '../utils/index.js';

// ===== ÉVÉNEMENTS SOCKET.IO =====
export * from './socketio-events.js';

// Import pour éviter les conflits de noms
import type { MessageTranslationCache, SocketIOUser, TranslationData, UserPermissions } from './socketio-events.js';

// Ré-export des types essentiels
export type { TranslationData, MessageTranslationCache, SocketIOUser };

// ===== ENUM DES RÔLES UNIFORMES =====
/**
 * Rôles globaux des utilisateurs (aligné avec schema.prisma User.role)
 * @see shared/schema.prisma ligne 35
 */
export enum UserRoleEnum {
  BIGBOSS = 'BIGBOSS',
  ADMIN = 'ADMIN',
  MODO = 'MODO',        // Moderator global (schema.prisma)
  AUDIT = 'AUDIT',
  ANALYST = 'ANALYST',
  USER = 'USER',
  // Aliases pour rétrocompatibilité
  MODERATOR = 'MODO',   // Alias de MODO
  CREATOR = 'ADMIN',    // Alias de ADMIN (créateur de communauté)
  MEMBER = 'USER'       // Alias de USER (membre standard)
}

/**
 * Rôles dans une conversation ou communauté (aligné avec ConversationMember.role)
 * @see shared/schema.prisma ligne 94
 */
export type ConversationRole = 'admin' | 'moderator' | 'member';

// ===== TYPES SPÉCIFIQUES À LA TRADUCTION =====
export interface TranslationRequest {
  messageId: string;
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  modelType?: 'basic' | 'medium' | 'premium';
  conversationId?: string;
  participantIds?: string[];
  requestType?: 'conversation' | 'direct' | 'forced' | 'batch';
}

export interface TranslationResponse {
  messageId: string;
  translatedText: string;
  detectedSourceLanguage: string;
  status: number;
  metadata?: {
    confidenceScore: number;
    fromCache: boolean;
    modelUsed: string;
    processingTimeMs?: number;
  };
}

// ===== TYPES DE SERVICE =====
export interface ServiceConfig {
  port: number;
  host: string;
  jwtSecret: string;
  databaseUrl: string;
  translationServicePort?: number;
}

export interface ServiceHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  uptime: number;
  connections: number;
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  timestamp: Date;
}

// Legacy API types removed - use api-responses.ts instead

// ===== TYPES POUR LES MESSAGES - LEGACY (DEPRECATED) =====
// Ces types sont remplacés par ceux dans conversation.ts
// Gardés pour rétrocompatibilité temporaire

// Importation des types de messages consolidés
import type { Message as ConsolidatedMessage, MessageWithTranslations as ConsolidatedMessageWithTranslations } from './conversation.js';

// Alias pour rétrocompatibilité
export type Message = ConsolidatedMessage;
export type MessageWithTranslations = ConsolidatedMessageWithTranslations;

export interface BubbleTranslation {
  language: string;
  content: string;
  status: 'pending' | 'translating' | 'completed';
  timestamp: Date;
  confidence: number; // 0-1 pour la qualité de traduction
  translationModel?: 'basic' | 'medium' | 'premium'; // Modèle utilisé pour cette traduction
  cached?: boolean; // Indique si la traduction vient du cache
}

// NotificationType est maintenant exporté depuis notification.ts
// Les anciennes valeurs legacy (message, group_invite, etc.) sont maintenant
// mappées vers les nouvelles valeurs dans NotificationTypeEnum

/**
 * Message traduit (legacy, utiliser MessageWithTranslations à la place)
 * @deprecated Utilisez les types de message-types.ts
 */
export interface TranslatedMessage {
  // Core message properties
  readonly id: string;
  readonly conversationId: string;
  readonly senderId?: string;
  readonly anonymousSenderId?: string;
  readonly content: string;
  readonly originalLanguage: string;
  readonly messageType: MessageType;
  readonly isEdited: boolean;
  readonly editedAt?: Date;
  readonly isDeleted: boolean;
  readonly deletedAt?: Date;
  readonly replyToId?: string;
  readonly createdAt: Date;
  readonly updatedAt?: Date;
  readonly timestamp: Date;
  readonly sender?: SocketIOUser | AnonymousParticipant;
  readonly anonymousSender?: AnonymousParticipant;
  
  // Translation-specific properties
  readonly translation?: BubbleTranslation;
  readonly originalContent?: string;
  readonly translatedContent?: string;
  readonly targetLanguage?: string;
  readonly isTranslated?: boolean;
  readonly isTranslating?: boolean;
  readonly showingOriginal?: boolean;
  readonly translationError?: string;
  readonly translationFailed?: boolean;
  readonly translations?: readonly TranslationData[];
}

/**
 * Traduction simple
 */
export interface Translation {
  readonly language: string;
  readonly content: string;
  readonly flag: string;
  readonly createdAt: Date;
}

// Notification est maintenant exporté depuis notification.ts
// L'interface unifiée supporte à la fois la structure plate (Prisma) et imbriquée (frontend)

export type UserRole = UserRoleEnum;

// Utilitaires pour les rôles et permissions
export const ROLE_HIERARCHY: Readonly<Record<string, number>> = {
  [UserRoleEnum.BIGBOSS]: 7,
  [UserRoleEnum.ADMIN]: 5,
  [UserRoleEnum.MODO]: 4,
  [UserRoleEnum.AUDIT]: 3,
  [UserRoleEnum.ANALYST]: 2,
  [UserRoleEnum.USER]: 1,
  // Aliases ne sont pas inclus dans le record car ils pointent vers les mêmes valeurs
  // Pour récupérer la hiérarchie d'un alias, utilisez la valeur de l'enum directement
};

export const DEFAULT_PERMISSIONS: Readonly<Record<string, UserPermissions>> = {
  [UserRoleEnum.BIGBOSS]: {
    canAccessAdmin: true,
    canManageUsers: true,
    canManageGroups: true,
    canManageConversations: true,
    canViewAnalytics: true,
    canModerateContent: true,
    canViewAuditLogs: true,
    canManageNotifications: true,
    canManageTranslations: true,
  },
  [UserRoleEnum.ADMIN]: {
    canAccessAdmin: true,
    canManageUsers: true,
    canManageGroups: true,
    canManageConversations: true,
    canViewAnalytics: true,
    canModerateContent: true,
    canViewAuditLogs: true,
    canManageNotifications: true,
    canManageTranslations: false,
  },
  [UserRoleEnum.MODO]: {
    canAccessAdmin: true,
    canManageUsers: false,
    canManageGroups: true,
    canManageConversations: true,
    canViewAnalytics: false,
    canModerateContent: true,
    canViewAuditLogs: false,
    canManageNotifications: false,
    canManageTranslations: false,
  },
  [UserRoleEnum.AUDIT]: {
    canAccessAdmin: true,
    canManageUsers: false,
    canManageGroups: false,
    canManageConversations: false,
    canViewAnalytics: true,
    canModerateContent: false,
    canViewAuditLogs: true,
    canManageNotifications: false,
    canManageTranslations: false,
  },
  [UserRoleEnum.ANALYST]: {
    canAccessAdmin: true,
    canManageUsers: false,
    canManageGroups: false,
    canManageConversations: false,
    canViewAnalytics: true,
    canModerateContent: false,
    canViewAuditLogs: false,
    canManageNotifications: false,
    canManageTranslations: false,
  },
  [UserRoleEnum.USER]: {
    canAccessAdmin: false,
    canManageUsers: false,
    canManageGroups: false,
    canManageConversations: false,
    canViewAnalytics: false,
    canModerateContent: false,
    canViewAuditLogs: false,
    canManageNotifications: false,
    canManageTranslations: false,
  },
  // Aliases ne sont pas inclus car ils retournent les mêmes valeurs string que les rôles principaux
};

// ===== TYPES POUR LES CONVERSATIONS - LEGACY (DEPRECATED) =====
// Ces types sont remplacés par ceux dans conversation.ts
// Gardés pour rétrocompatibilité temporaire

// Importation des types unifiés depuis conversation.ts
import type {
  Conversation as UnifiedConversation,
  ConversationParticipant as UnifiedConversationParticipant,
  ThreadMember as UnifiedThreadMember
} from './conversation.js';

// Export des types unifiés (plus de duplication)
// Note: ThreadMember est le type simplifié pour Socket.IO/UI
// ConversationMember (Prisma-aligned) est maintenant exporté depuis conversation.ts
export type ThreadMember = UnifiedThreadMember;
export type Conversation = UnifiedConversation;
export type ConversationParticipant = UnifiedConversationParticipant;

/**
 * Membre d'un groupe
 */
export interface GroupMember {
  readonly id: string;
  readonly groupId: string;
  readonly userId: string;
  readonly joinedAt: Date;
  readonly role: UserRoleEnum;
  readonly user: SocketIOUser;
}

/**
 * Informations du créateur d'un groupe
 */
export interface GroupCreatorInfo {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly avatar?: string | null;
}

/**
 * Groupe de conversations (Community)
 * Aligné avec le modèle Prisma Community et les réponses API
 */
export interface Group {
  readonly id: string;
  readonly identifier?: string;
  readonly name: string;
  readonly description?: string;
  readonly avatar?: string | null;
  readonly isPrivate: boolean;
  readonly maxMembers?: number;
  readonly createdBy?: string;
  readonly isActive?: boolean;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
  readonly members: readonly GroupMember[] | unknown[];
  readonly conversations: readonly Conversation[] | string[];
  readonly creator?: GroupCreatorInfo;
  readonly _count?: {
    readonly members: number;
    readonly Conversation?: number;
    readonly conversations?: number;
  };
}

/**
 * Informations du créateur d'un lien
 */
export interface LinkCreatorInfo {
  readonly id: string;
  readonly username: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly displayName: string;
  readonly avatar?: string;
}

/**
 * Statistiques d'un lien de conversation
 */
export interface ConversationLinkStats {
  readonly totalParticipants: number;
  readonly memberCount: number;
  readonly anonymousCount: number;
  readonly languageCount: number;
  readonly spokenLanguages: readonly string[];
}

/**
 * Lien de partage de conversation
 */
export interface ConversationLink {
  readonly id: string;
  readonly conversationId: string;
  readonly linkId: string;
  readonly name?: string;
  readonly description?: string;
  readonly maxUses?: number;
  readonly currentUses: number;
  readonly maxConcurrentUsers?: number;
  readonly currentConcurrentUsers: number;
  readonly maxUniqueSessions?: number;
  readonly currentUniqueSessions: number;
  readonly expiresAt?: Date;
  readonly isActive: boolean;
  readonly allowAnonymousMessages: boolean;
  readonly allowAnonymousFiles: boolean;
  readonly allowAnonymousImages: boolean;
  readonly allowViewHistory: boolean;
  readonly requireNickname: boolean;
  readonly requireEmail: boolean;
  readonly allowedCountries: readonly string[];
  readonly allowedLanguages: readonly string[];
  readonly allowedIpRanges: readonly string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly conversation: Conversation;
  readonly creator?: LinkCreatorInfo;
  readonly stats?: ConversationLinkStats;
}

// ===== TYPES POUR L'AUTHENTIFICATION =====

/**
 * Requête d'authentification
 */
export interface AuthRequest {
  readonly username: string;
  readonly password?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly email?: string;
  readonly phoneNumber?: string;
  readonly systemLanguage?: string;
  readonly regionalLanguage?: string;
}

/**
 * Réponse d'authentification
 */
export interface AuthResponse {
  readonly success: boolean;
  readonly user?: SocketIOUser;
  readonly token?: string;
  readonly message?: string;
}

/**
 * Modes d'authentification
 */
export type AuthMode = 'welcome' | 'login' | 'register' | 'join';

// ===== TYPES POUR LES INDICATEURS =====

/**
 * Indicateur de frappe
 */
export interface TypingIndicator {
  readonly userId: string;
  readonly conversationId: string;
  readonly isTyping: boolean;
  readonly user: SocketIOUser;
}

/**
 * Statut en ligne d'un utilisateur
 */
export interface OnlineStatus {
  readonly userId: string;
  readonly isOnline: boolean;
  readonly lastActiveAt: Date;
}

// ===== TYPES POUR L'ERREUR HANDLING =====

/**
 * Réponse d'erreur standardisée
 */
export interface ErrorResponse {
  readonly success: false;
  readonly error: string;
  readonly code?: string;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
  readonly timestamp: Date;
}

/**
 * Erreur de validation
 */
export interface ValidationError {
  readonly field: string;
  readonly message: string;
  readonly value?: string | number | boolean | null;
}

// ===== CONSTANTES =====
// Réexporter les langues supportées depuis le module centralisé (41 langues)
export {
  SUPPORTED_LANGUAGES,
  type SupportedLanguageInfo,
  type SupportedLanguageCode,
  getLanguageInfo,
  getLanguageName,
  getLanguageFlag,
  getLanguageColor,
  getLanguageTranslateText,
  isSupportedLanguage,
  getSupportedLanguageCodes,
  filterSupportedLanguages
} from '../utils/languages.js';

// Maintenir la compatibilité avec l'ancien type LanguageCode
export interface LanguageCode {
  code: string;
  name: string;
  flag: string;
  translateText: string;
}

// Type pour les codes de langue supportés (alias pour compatibilité)
export type SupportedLanguage = string;

export const TRANSLATION_MODELS = ['basic', 'medium', 'premium'] as const;
export type TranslationModel = typeof TRANSLATION_MODELS[number];

/**
 * Types de messages supportés (aligné avec schema.prisma)
 * @see shared/schema.prisma ligne 184
 */
export const MESSAGE_TYPES = ['text', 'image', 'file', 'audio', 'video', 'location', 'system'] as const;
export type MessageType = typeof MESSAGE_TYPES[number];

// ===== TYPES POUR LES STATISTIQUES =====

/**
 * Statistiques de connexion
 */
export interface ConnectionStats {
  readonly connectedSockets: number;
  readonly connectedUsers: number;
  readonly activeConversations: number;
  readonly typingUsers: Readonly<Record<string, number>>;
  readonly messagesPerSecond?: number;
  readonly translationsPerSecond?: number;
}

/**
 * Statistiques de traduction
 */
export interface TranslationStats {
  readonly requestsTotal: number;
  readonly requestsSuccess: number;
  readonly requestsError: number;
  readonly cacheHitRate: number;
  readonly averageProcessingTime: number;
  readonly modelUsage: Readonly<Record<TranslationModel, number>>;
}

// ===== TYPES POUR MISE À JOUR UTILISATEUR =====

/**
 * Requête de mise à jour utilisateur
 */
export interface UpdateUserRequest {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly displayName?: string;
  readonly email?: string;
  readonly phoneNumber?: string;
  readonly systemLanguage?: string;
  readonly regionalLanguage?: string;
  readonly customDestinationLanguage?: string;
  readonly autoTranslateEnabled?: boolean;
  readonly translateToSystemLanguage?: boolean;
  readonly translateToRegionalLanguage?: boolean;
  readonly useCustomDestination?: boolean;
}

/**
 * Réponse de mise à jour utilisateur
 */
export interface UpdateUserResponse {
  readonly success: boolean;
  readonly data?: Partial<SocketIOUser>;
  readonly error?: string;
  readonly message?: string;
}

// ===== TYPES POUR LES REQUÊTES =====

/**
 * Requête de création de conversation
 */
export interface CreateConversationRequest {
  readonly type: 'direct' | 'group' | 'public' | 'global';
  readonly name?: string;
  readonly title?: string; // Alias pour name
  readonly description?: string;
  readonly isPrivate?: boolean;
  readonly maxMembers?: number;
  readonly participantIds?: readonly string[];
  readonly participants?: readonly string[]; // Alias pour la rétrocompatibilité
  readonly communityId?: string;
  readonly identifier?: string;
}

/**
 * Requête d'envoi de message
 */
export interface SendMessageRequest {
  readonly content: string;
  readonly originalLanguage?: string;
  readonly messageType?: string;
}

// ===== RE-EXPORTS POUR RÉTROCOMPATIBILITÉ =====
export type {
  SocketIOMessage,
  SocketIOUser as User,
  SocketIOResponse as SocketResponse,
  MessageTranslationCache as TranslationCache,
  UserLanguageConfig,
  ConnectionStatus,
  ConnectionDiagnostics,
  UserPermissions
} from './socketio-events.js';
