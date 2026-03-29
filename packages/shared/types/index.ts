/**
 * Types partagés Meeshy - Index principal
 * 
 * Centralise tous les types utilisés à travers l'application
 * Gateway, Frontend, et Translator
 */

// ===== UNIFIED PARTICIPANT TYPES =====
export {
  ParticipantTypeEnum,
  type ParticipantType,
  ParticipantPermissionsSchema,
  type ParticipantPermissions,
  AnonymousSessionDetailsSchema,
  AnonymousProfileSchema,
  type AnonymousProfile,
  AnonymousRightsOverrideSchema,
  AnonymousSessionSchema,
  type AnonymousSession,
  ParticipantSchema,
  type Participant,
  DEFAULT_USER_PERMISSIONS,
  DEFAULT_ANONYMOUS_PERMISSIONS,
} from './participant.js';

// Export des types unifies Phase 1
export * from './conversation.js';
export * from './user.js';
export * from './anonymous.js';
export * from './api-responses.js';
export * from './api-schemas.js';
export * from './migration-utils.js';

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
// V2: Remplacé par attachment-audio.js qui utilise JSON intégré dans MessageAttachment
// export * from './attachment-transcription.js';

// Export des types unifiés Phase 6 - Video Calls
export * from './video-call.js';

// Export des types unifiés Phase 7 - Audio Effects Timeline
export * from './audio-effects-timeline.js';

// Export des types unifiés Phase 8 - Push Notifications
export * from './push-notification.js';

// NOTE: Les types de notifications sont dans /apps/web/types/notification.ts
// Ils ne sont pas dans /shared car ils utilisent des types frontend spécifiques
// Le backend doit importer NotificationType depuis le webapp si nécessaire

// Export des types posts/stories/statuts
export * from './post.js';

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

// Export des types Magic Link (authentification sans mot de passe)
export * from './magic-link.js';

// Export des types Signal Protocol database (pre-key bundles, conversation keys)
export * from './signal-database.js';

// Export des types DMA interopérabilité (WhatsApp, Messenger)
export * from './dma.js';

// Export des nouveaux types audio intégrés (JSON dans MessageAttachment)
export * from './attachment-audio.js';

// V2: Supprimé - utiliser attachment-audio.js à la place
// Export des types transcription audio et clonage vocal (DEPRECATED - utiliser attachment-audio.js)
// export * from './audio-transcription.js';

// V2: Supprimé - utiliser attachment-audio.js à la place
// Export des types pour les audios traduits (DEPRECATED - utiliser attachment-audio.js)
// export * from './translated-audio.js';

// Export des types suppression de messages
export * from './message-deletion.js';

// Export des types message effect flags (bitfield)
export * from './message-effect-flags.js';

// Export des types notifications complètes (Structure Groupée V2)
export {
  // Enums
  NotificationTypeEnum,

  // Type unions
  type NotificationType,
  type NotificationPriority,

  // Main interfaces (Structure Groupée)
  type NotificationActor,
  type NotificationContext,
  type NotificationState,
  type NotificationDelivery,
  type NotificationMetadata,
  type Notification,

  // Type guards (metadata discriminated unions)
  isMessageNotification,
  isMentionNotification,
  isReactionNotification,
  isCallNotification,
  isFriendRequestNotification,
  isMemberEventNotification,
  isSystemNotification,

  // DTOs
  type CreateNotificationDTO,
  type UpdateNotificationDTO,

  // Filters and pagination
  type NotificationFilters,
  type NotificationResponse,

  // Preferences
  type NotificationPreference,
  type CreateNotificationPreferenceDTO,
  type UpdateNotificationPreferenceDTO,

  // Utility functions
  isNotificationExpired,
  isNotificationUnread,
  isDNDActive,
  isNotificationTypeEnabled,
  shouldSendNotification,
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

// ===== TYPES CANONIQUES NORMALISÉS =====
// Export sélectif des nouveaux types normalisés pour éviter les conflits
// Ces types sont les versions canoniques - utiliser ces types pour les nouveaux développements

// Status types (exports sélectifs pour éviter conflits avec les types existants)
export {
  type ProcessStatus,
  type TranslationStatus as CanonicalTranslationStatus,
  type DeliveryStatus as CanonicalDeliveryStatus,
  type EntityStatus,
  type UserStatus,
  type ServiceHealthStatus,
  type VisibilityStatus,
  type VerificationStatus,
  PROCESS_STATUS_ALIASES,
  DELIVERY_STATUS_ORDER,
  normalizeProcessStatus,
  toUITranslationStatus,
  isDeliveryStatusBetter,
  aggregateHealthStatus,
} from './status-types.js';

// Role types (exports sélectifs pour éviter conflits avec UserRole existant)
export {
  GlobalUserRole,
  type GlobalUserRoleType,
  MemberRole,
  type MemberRoleType,
  type WritePermissionLevel,
  GLOBAL_ROLE_HIERARCHY,
  MEMBER_ROLE_HIERARCHY,
  WRITE_PERMISSION_HIERARCHY,
  hasMinimumRole,
  hasMinimumMemberRole,
  normalizeGlobalRole,
  isGlobalUserRole,
  isMemberRole,
  isGlobalAdmin,
  isGlobalModerator,
  isMemberAdmin,
  isMemberModerator,
  isMemberCreator,
  // Unified role resolution
  getEffectiveRole,
  getEffectiveRoleLevel,
  hasModeratorPrivileges,
  // Legacy alias — use MemberRoleType instead
  type ConversationRole,
} from './role-types.js';

// Re-import GlobalUserRole and GLOBAL_ROLE_HIERARCHY as values for legacy aliases below
import { GlobalUserRole, GLOBAL_ROLE_HIERARCHY } from './role-types.js';

// Delivery queue types
export * from './delivery-queue.js';

// Action types (pas de conflits majeurs)
export * from './action-types.js';

// ===== ÉVÉNEMENTS SOCKET.IO =====
export * from './socketio-events.js';

// Import pour éviter les conflits de noms
import type { MessageTranslationCache, SocketIOUser, TranslationData, UserPermissions, MessageType } from './socketio-events.js';

// Ré-export des types essentiels
export type { TranslationData, MessageTranslationCache, SocketIOUser };

// ===== ENUM DES RÔLES UNIFORMES =====
/**
 * Rôles globaux des utilisateurs (aligné avec schema.prisma User.role)
 * @deprecated Use GlobalUserRole instead
 * @see shared/schema.prisma ligne 35
 */
export const UserRoleEnum = GlobalUserRole;
/** @deprecated Use GlobalUserRole instead */
export type UserRoleEnum = GlobalUserRole;

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
  readonly senderId: string;
  readonly content: string;
  readonly originalLanguage: string;
  readonly messageType: MessageType;
  readonly isEdited: boolean;
  readonly editedAt?: Date;
  readonly deletedAt?: Date;
  readonly replyToId?: string;
  readonly createdAt: Date;
  readonly updatedAt?: Date;
  readonly timestamp: Date;
  /** @deprecated Use Participant type for sender */
  readonly sender?: SocketIOUser;
  /** @deprecated Use Participant type */
  readonly anonymousSender?: unknown;
  
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

export type UserRole = GlobalUserRole;

/** @deprecated Use GLOBAL_ROLE_HIERARCHY instead */
export const ROLE_HIERARCHY: Readonly<Record<string, number>> = GLOBAL_ROLE_HIERARCHY;

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
  [UserRoleEnum.MODERATOR]: {
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
  [UserRoleEnum.AGENT]: {
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

// Export des types unifies (plus de duplication)
// Note: These types are deprecated - use Participant from participant.ts instead
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
  readonly role: GlobalUserRole;
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


/**
 * Modes d'authentification
 */
export type AuthMode = 'welcome' | 'login' | 'register' | 'join';


// ValidationError is exported from messaging.ts via `export * from './messaging.js'`

// ===== CONSTANTES =====
// Réexporter les langues supportées depuis le module centralisé (60+ langues avec capacités)
export {
  // Types
  SUPPORTED_LANGUAGES,
  type SupportedLanguageInfo,
  type SupportedLanguageCode,
  type TTSEngine,
  type STTEngine,
  type LanguageRegion,
  type LanguageStats,

  // Fonctions de recherche
  getLanguageInfo,
  getLanguageName,
  getLanguageFlag,
  getLanguageColor,
  getLanguageTranslateText,
  isSupportedLanguage,
  getSupportedLanguageCodes,
  filterSupportedLanguages,

  // Fonctions de filtrage par capacité
  getLanguagesWithTTS,
  getLanguagesWithSTT,
  getLanguagesWithVoiceCloning,
  getLanguagesWithTranslation,
  getLanguagesByRegion,
  getAfricanLanguages,
  getMMSTTSLanguages,

  // Statistiques
  getLanguageStats,

  // Constantes
  MAX_MESSAGE_LENGTH,
  TOAST_SHORT_DURATION,
  TOAST_LONG_DURATION,
  TOAST_ERROR_DURATION,
  TYPING_CANCELATION_DELAY,
} from '../utils/languages.js';

// Maintenir la compatibilité avec l'ancien type LanguageCode
export interface LanguageCode {
  code: string;
  name: string;
  flag: string;
  translateText: string;
}


// TranslationModel is now exported from message-types.ts (via conversation.ts)
// MessageType is now exported from socketio-events.ts


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
  readonly type: 'direct' | 'group' | 'public' | 'global' | 'broadcast';
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
  readonly replyToId?: string;
  readonly forwardedFromId?: string;
  readonly forwardedFromConversationId?: string;
  readonly attachmentIds?: readonly string[];
}

// ===== RE-EXPORTS POUR RÉTROCOMPATIBILITÉ =====
export type {
  SocketIOMessage,
  SocketIOMessageSender,
  SocketIOUser as User,
  SocketIOResponse as SocketResponse,
  MessageTranslationCache as TranslationCache,
  UserLanguageConfig,
  ConnectionStatus,
  ConnectionDiagnostics,
  UserPermissions
} from './socketio-events.js';

// ===== AGENT TYPES =====
export type { AgentType } from './agent.js';
export { AGENT_TYPES } from './agent.js';
