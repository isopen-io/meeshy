/**
 * Types unifiés pour les conversations Meeshy
 * Harmonisation Gateway ↔ Frontend
 */

import type { SocketIOUser as User, MessageType } from './socketio-events';
import type { AnonymousParticipant } from './anonymous';
import type { Attachment } from './attachment';

/**
 * Rôle utilisateur global (aligné avec schema.prisma User.role)
 * @see shared/schema.prisma ligne 35
 */
export type UserRole = 'USER' | 'ADMIN' | 'MODO' | 'BIGBOSS' | 'AUDIT' | 'ANALYST' | 
  // Aliases pour rétrocompatibilité
  'MODERATOR' | 'CREATOR' | 'MEMBER';

/**
 * Langue parlée avec statistiques
 */
export interface LanguageUsageStats {
  readonly language: string;
  readonly messageCount: number;
  readonly percentage: number;
}

/**
 * Paire de langues pour traduction
 */
export interface LanguagePair {
  readonly from: string;
  readonly to: string;
  readonly count: number;
}

/**
 * Statistiques de traduction
 */
export interface TranslationStatsData {
  readonly totalTranslations: number;
  readonly cacheHitRate: number;             // % traductions depuis cache
  readonly averageTranslationTime: number;   // En ms
  readonly topLanguagePairs: readonly LanguagePair[];
}

/**
 * Statistiques d'une conversation
 */
export interface ConversationStats {
  readonly totalMessages: number;
  readonly totalParticipants: number;
  readonly activeParticipants: number;          // Participants actifs dernières 24h
  readonly messagesLast24h: number;
  readonly messagesLast7days: number;
  readonly averageResponseTime: number;         // En minutes
  readonly topLanguages: readonly LanguageUsageStats[];
  readonly translationStats: TranslationStatsData;
  readonly lastActivity: Date;
  readonly createdAt: Date;
}

/**
 * Types d'identifiants supportés pour une conversation
 * - id: ObjectId MongoDB (TOUJOURS pour API/WebSocket)
 * - identifier: Human-readable (OPTIONNEL pour URLs)
 */
export interface ConversationIdentifiers {
  readonly id: string;           // ObjectId MongoDB - TOUJOURS pour API/WebSocket
  readonly identifier?: string;  // Human-readable - OPTIONNEL pour URLs
}

// ===== MESSAGE TYPES CONSOLIDATED =====

/**
 * Modèle de traduction
 */
export type TranslationModel = 'basic' | 'medium' | 'premium';

/**
 * Type de base pour toutes les traductions
 * Aligned with schema.prisma MessageTranslation
 */
export interface MessageTranslation {
  readonly id: string;
  readonly messageId: string;
  readonly targetLanguage: string;
  readonly translatedContent: string;
  readonly translationModel: TranslationModel;
  readonly confidenceScore?: number;
  readonly createdAt: Date;
  readonly updatedAt?: Date;

  // Encryption fields for secure conversations (server/hybrid modes)
  readonly isEncrypted?: boolean;
  readonly encryptionKeyId?: string;
  readonly encryptionIv?: string;
  readonly encryptionAuthTag?: string;

  // Derived from message.originalLanguage (for compatibility)
  readonly sourceLanguage?: string;
  readonly cached?: boolean;
}

/**
 * Informations d'un expéditeur anonyme
 */
export interface AnonymousSenderInfo {
  readonly id: string;
  readonly username: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly language: string;
  readonly isMeeshyer: boolean;
}

/**
 * Message source/origin type
 * Aligned with schema.prisma Message.messageSource
 */
export type MessageSource = 'user' | 'system' | 'ads' | 'app' | 'agent' | 'authority';

// Import EncryptionMode from encryption.ts to avoid duplicate exports
import type { EncryptionMode } from './encryption';
export type { EncryptionMode };

/**
 * MESSAGE - Type principal pour toutes les communications
 * Aligned with schema.prisma Message model
 * Utilisé par :
 * - Gateway (API, WebSocket, Socket.IO)
 * - Frontend (affichage, état)
 * - Translator (traitement)
 */
export interface Message {
  // ===== IDENTIFIANTS =====
  readonly id: string;
  readonly conversationId: string;
  readonly senderId?: string;           // ID utilisateur authentifié
  readonly anonymousSenderId?: string;  // ID utilisateur anonyme

  // ===== CONTENU =====
  readonly content: string;
  readonly originalLanguage: string;
  readonly messageType: MessageType;
  readonly messageSource: MessageSource;  // user, system, ads, app, agent, authority

  // ===== ÉTAT DU MESSAGE =====
  readonly isEdited: boolean;
  readonly editedAt?: Date;
  readonly isDeleted: boolean;
  readonly deletedAt?: Date;

  // ===== RÉPONSE & FORWARDING =====
  readonly replyToId?: string;
  readonly replyTo?: Message;
  readonly forwardedFromId?: string;              // Original message ID if forwarded
  readonly forwardedFromConversationId?: string;  // Original conversation ID

  // ===== EXPIRATION =====
  readonly expiresAt?: Date;  // Self-destructing messages

  // ===== VIEW-ONCE & BLUR =====
  readonly isViewOnce: boolean;        // View-once message (disappears after view)
  readonly maxViewOnceCount?: number;  // Max unique viewers allowed
  readonly viewOnceCount: number;      // Number of unique viewers (denormalized)
  readonly isBlurred: boolean;         // Content blurred until tap to reveal

  // ===== DELIVERY STATUS (denormalized) =====
  readonly deliveredToAllAt?: Date;
  readonly receivedByAllAt?: Date;
  readonly readByAllAt?: Date;
  readonly deliveredCount: number;
  readonly readCount: number;

  // ===== E2EE / ENCRYPTION =====
  readonly encryptedContent?: string;       // Base64 encoded ciphertext
  readonly encryptionMode?: EncryptionMode; // 'server', 'e2ee', 'hybrid', null
  readonly encryptionMetadata?: Record<string, unknown>;  // IV, auth tag, key version
  readonly isEncrypted: boolean;

  // ===== MÉTADONNÉES =====
  readonly createdAt: Date;
  readonly updatedAt?: Date;

  // ===== MENTIONS =====
  readonly validatedMentions?: readonly string[];

  // ===== EXPÉDITEUR =====
  readonly sender?: User | AnonymousParticipant;

  // ===== TRADUCTIONS =====
  readonly translations: readonly MessageTranslation[];

  // ===== ATTACHMENTS =====
  readonly attachments?: readonly Attachment[];

  // ===== COMPATIBILITÉ =====
  readonly timestamp: Date;  // Alias pour createdAt

  // ===== PARTICIPANT ANONYME =====
  readonly anonymousSender?: AnonymousSenderInfo;
}

/**
 * Statut de traduction UI
 */
export type UITranslationStatus = 'pending' | 'translating' | 'completed' | 'failed';

/**
 * État de traduction dans l'interface utilisateur
 */
export interface UITranslationState {
  readonly language: string;
  readonly content: string;
  readonly status: UITranslationStatus;
  readonly timestamp: Date;
  readonly confidence?: number;
  readonly model?: TranslationModel;
  readonly error?: string;
  readonly fromCache: boolean;
}

/**
 * Statut de lecture pour un message
 */
export interface MessageReadStatus {
  readonly userId: string;
  readonly readAt: Date;
}

/**
 * MESSAGE AVEC TRADUCTIONS - Message enrichi avec traductions et états UI
 * Utilisé par le Frontend pour l'affichage et la gestion des traductions
 */
export interface MessageWithTranslations extends Message {
  // ===== TRADUCTIONS UI =====
  readonly uiTranslations: readonly UITranslationState[];
  readonly translatingLanguages: Set<string>;
  readonly currentDisplayLanguage: string;
  readonly showingOriginal: boolean;
  readonly originalContent: string;

  // ===== ÉTAT DE LECTURE =====
  readonly readStatus?: readonly MessageReadStatus[];

  // ===== MÉTADONNÉES SUPPLÉMENTAIRES =====
  readonly location?: string;

  // ===== PERMISSIONS UI =====
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  readonly canTranslate: boolean;
  readonly canReply: boolean;
}

/**
 * Type de conversation
 */
export type ConversationType = 'direct' | 'group' | 'public' | 'global' | 'broadcast';

/**
 * Statut de conversation
 */
export type ConversationStatus = 'active' | 'archived' | 'deleted';

/**
 * Visibilité de conversation
 */
export type ConversationVisibility = 'public' | 'private' | 'restricted';

/**
 * Type de lien de conversation
 */
export type ConversationLinkType = 'invite' | 'share' | 'embed';

/**
 * Permissions d'un participant
 */
export interface ParticipantPermissions {
  readonly canInvite: boolean;
  readonly canRemove: boolean;
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  readonly canModerate: boolean;
}

/**
 * Participant d'une conversation
 */
export interface ConversationParticipantInfo {
  readonly userId: string;
  readonly role: UserRole;
  readonly joinedAt: Date;
  readonly isActive: boolean;
  readonly permissions?: ParticipantPermissions;
}

/**
 * Paramètres d'une conversation
 */
export interface ConversationSettings {
  readonly allowAnonymous: boolean;
  readonly requireApproval: boolean;
  readonly maxParticipants?: number;
  readonly autoArchive?: boolean;
  readonly translationEnabled: boolean;
  readonly defaultLanguage?: string;
  readonly allowedLanguages?: readonly string[];
}

/**
 * Lien de partage d'une conversation
 */
export interface ConversationLink {
  readonly id: string;
  readonly type: ConversationLinkType;
  readonly url: string;
  readonly expiresAt?: Date;
  readonly maxUses?: number;
  readonly currentUses: number;
  readonly isActive: boolean;
  readonly createdBy: string;
  readonly createdAt: Date;
}

/**
 * Conversation unifiée
 * Aligned with schema.prisma Conversation model
 * Contient TOUS les champs utilisés dans Gateway et Frontend pour compatibilité totale
 */
export interface Conversation {
  // ===== IDENTIFIANTS =====
  readonly id: string;
  readonly identifier?: string;

  // ===== MÉTADONNÉES =====
  readonly title?: string;
  readonly description?: string;
  readonly type: ConversationType;
  readonly status: ConversationStatus;
  readonly visibility: ConversationVisibility;
  readonly image?: string;   // URL de l'image de la conversation
  readonly avatar?: string;  // URL de l'avatar
  readonly banner?: string;  // URL du banner/cover image

  // ===== COMMUNITY =====
  readonly communityId?: string;
  readonly isActive: boolean;
  readonly memberCount: number;  // Denormalized for performance

  // ===== PARTICIPANTS =====
  readonly participants: readonly ConversationParticipantInfo[];

  // ===== MESSAGES =====
  readonly lastMessage?: Message;
  readonly lastMessageAt?: Date;
  readonly messageCount?: number;
  readonly unreadCount?: number;

  // ===== E2EE / ENCRYPTION =====
  readonly encryptionMode?: EncryptionMode;       // null, 'server', 'e2ee'
  readonly encryptionProtocol?: string;           // 'aes-256-gcm', 'signal_v3'
  readonly encryptionEnabledAt?: Date;
  readonly encryptionEnabledBy?: string;          // User ID who enabled
  readonly serverEncryptionKeyId?: string;        // For server-side encryption

  // ===== STATISTIQUES =====
  readonly stats?: ConversationStats;

  // ===== CONFIGURATION =====
  readonly settings?: ConversationSettings;

  // ===== LIENS ET PARTAGE =====
  readonly links?: readonly ConversationLink[];

  // ===== TIMESTAMPS =====
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastActivityAt?: Date;

  // ===== CRÉATEUR =====
  readonly createdBy?: string;
  readonly createdByUser?: User;
}

/**
 * Membre d'une conversation (ThreadMember)
 */
export interface ThreadMember {
  readonly id: string;
  readonly conversationId: string;
  readonly userId: string;
  readonly user: User;
  readonly role: UserRole;
  readonly joinedAt: Date;
  readonly isActive: boolean;
  readonly isAnonymous: boolean;
  readonly permissions?: ParticipantPermissions;
}

/**
 * Traduction individuelle dans TranslationData
 */
export interface TranslationItem {
  readonly targetLanguage: string;
  readonly translatedContent: string;
  readonly confidence?: number;
  readonly model?: TranslationModel;
  readonly fromCache: boolean;
}

/**
 * Données de traduction reçues via Socket.IO
 */
export interface TranslationData {
  readonly messageId: string;
  readonly translations: readonly TranslationItem[];
  readonly timestamp: Date;
}

/**
 * Message traduit pour l'affichage
 */
export interface TranslatedMessage extends Message {
  readonly translatedContent?: string;
  readonly targetLanguage?: string;
  readonly translationConfidence?: number;
  readonly translationModel?: TranslationModel;
  readonly isTranslationCached?: boolean;
}

// ===== SHARE LINK TYPES =====

/**
 * Lien de partage de conversation (alias)
 */
export interface ConversationShareLink {
  readonly id: string;
  readonly type: ConversationLinkType;
  readonly url: string;
  readonly expiresAt?: Date;
  readonly maxUses?: number;
  readonly currentUses: number;
  readonly isActive: boolean;
  readonly createdBy: string;
  readonly createdAt: Date;
  // Permissions anonymes
  readonly allowAnonymousMessages?: boolean;
  readonly allowAnonymousFiles?: boolean;
  readonly allowAnonymousImages?: boolean;
  readonly allowViewHistory?: boolean;
  // Exigences pour rejoindre
  readonly requireAccount?: boolean;
  readonly requireNickname?: boolean;
  readonly requireEmail?: boolean;
  readonly requireBirthday?: boolean;
}

// ===== CONVERSATION PARTICIPANT =====

/**
 * Participant de conversation (alias)
 */
export interface ConversationParticipant {
  readonly userId: string;
  readonly role: UserRole;
  readonly joinedAt: Date;
  readonly isActive: boolean;
  readonly permissions?: ParticipantPermissions;
}

// ===== TYPE ALIASES FOR COMPATIBILITY =====
export type BubbleStreamMessage = MessageWithTranslations;

// ===== STATUS ENTRY TYPES =====
// Aligned with schema.prisma MessageStatusEntry and AttachmentStatusEntry

/**
 * Per-user message delivery/read status
 * Aligned with schema.prisma MessageStatusEntry
 */
export interface MessageStatusEntry {
  readonly id: string;
  readonly messageId: string;
  readonly conversationId: string;
  readonly userId?: string;
  readonly anonymousId?: string;

  // Delivery timestamps
  readonly deliveredAt?: Date;
  readonly receivedAt?: Date;
  readonly readAt?: Date;

  // Read details
  readonly readDurationMs?: number;
  readonly readDevice?: 'ios' | 'android' | 'web' | 'desktop';
  readonly clientVersion?: string;

  // View-once status
  readonly viewedOnceAt?: Date;
  readonly revealedAt?: Date;

  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Per-user attachment consumption status
 * Aligned with schema.prisma AttachmentStatusEntry
 */
export interface AttachmentStatusEntry {
  readonly id: string;
  readonly attachmentId: string;
  readonly conversationId: string;
  readonly userId?: string;
  readonly anonymousId?: string;

  // Delivery & consumption timestamps
  readonly deliveredAt?: Date;
  readonly viewedAt?: Date;
  readonly downloadedAt?: Date;
  readonly listenedAt?: Date;      // Audio
  readonly watchedAt?: Date;       // Video

  // Consumption metrics
  readonly playbackPosition?: number;     // ms for audio/video
  readonly playbackCompleted: boolean;
  readonly downloadCount: number;

  // Image-specific
  readonly wasZoomed: boolean;

  // Document-specific
  readonly pagesViewed: number;
  readonly lastPageViewed?: number;

  // View-once status
  readonly viewedOnceAt?: Date;
  readonly revealedAt?: Date;

  // Device info
  readonly accessDevice?: string;

  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Conversation read cursor for optimized unread tracking
 * Aligned with schema.prisma ConversationReadCursor
 */
export interface ConversationReadCursor {
  readonly id: string;
  readonly conversationId: string;
  readonly userId?: string;
  readonly anonymousId?: string;

  readonly lastReadMessageId?: string;
  readonly lastReadAt?: Date;
  readonly unreadCount: number;

  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Reaction on an attachment
 * Aligned with schema.prisma AttachmentReaction
 */
export interface AttachmentReaction {
  readonly id: string;
  readonly attachmentId: string;
  readonly userId?: string;
  readonly anonymousId?: string;
  readonly emoji: string;
  readonly createdAt: Date;
}