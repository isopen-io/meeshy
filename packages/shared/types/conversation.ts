/**
 * Types unifies pour les conversations Meeshy
 * Harmonisation Gateway <-> Frontend
 */

import type { SocketIOUser as User, MessageType } from './socketio-events.js';
import type { Participant } from './participant.js';
import type { Attachment } from './attachment.js';
import type { TranslationModel, MessageTranslation, MessageStatusEntry, UITranslationState, UITranslationStatus } from './message-types.js';
import type { MentionedUser } from './mention.js';

// Re-export canonical types from message-types.ts
export type { TranslationModel, MessageTranslation, MessageStatusEntry, UITranslationState, UITranslationStatus };

/**
 * Import du type UserRole depuis user.ts (eviter la duplication)
 * @see user.ts UserRole type
 */
import type { UserRole } from './user.js';

/**
 * Import du type MemberRoleType depuis role-types.ts (type unifie pour conversations et communautes)
 * @see role-types.ts MemberRole enum
 */
import type { MemberRoleType } from './role-types.js';
import { isMemberAdmin as isMemberAdminRole, isMemberModerator as isMemberModeratorRole } from './role-types.js';

/**
 * Langue parlee avec statistiques
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
  readonly cacheHitRate: number;
  readonly averageTranslationTime: number;
  readonly topLanguagePairs: readonly LanguagePair[];
}

/**
 * Statistiques d'une conversation
 */
export interface ConversationStats {
  readonly totalMessages: number;
  readonly totalParticipants: number;
  readonly activeParticipants: number;
  readonly messagesLast24h: number;
  readonly messagesLast7days: number;
  readonly averageResponseTime: number;
  readonly topLanguages: readonly LanguageUsageStats[];
  readonly translationStats: TranslationStatsData;
  readonly lastActivity: Date;
  readonly createdAt: Date;
}

/**
 * Types d'identifiants supportes pour une conversation
 */
export interface ConversationIdentifiers {
  readonly id: string;
  readonly identifier?: string;
}

// ===== MESSAGE TYPES (canonical definitions in message-types.ts) =====

/**
 * Informations d'un expediteur anonyme
 * @deprecated Use Participant with type='anonymous' instead
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
import type { EncryptionMode } from './encryption.js';
export type { EncryptionMode };

/**
 * MESSAGE - Type principal pour toutes les communications
 * Aligned with schema.prisma Message model
 */
export interface Message {
  // ===== IDENTIFIANTS =====
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string;

  // ===== CONTENU =====
  readonly content: string;
  readonly originalLanguage: string;
  readonly messageType: MessageType;
  readonly messageSource: MessageSource;

  // ===== ETAT DU MESSAGE =====
  readonly isEdited: boolean;
  readonly editedAt?: Date;
  readonly deletedAt?: Date;

  // ===== REPONSE & FORWARDING =====
  readonly replyToId?: string;
  readonly replyTo?: Message;
  readonly forwardedFromId?: string;
  readonly forwardedFromConversationId?: string;

  // ===== EXPIRATION =====
  readonly expiresAt?: Date;

  // ===== VIEW-ONCE & BLUR =====
  readonly isViewOnce: boolean;
  readonly maxViewOnceCount?: number;
  readonly viewOnceCount: number;
  readonly isBlurred: boolean;

  // ===== PINNING =====
  readonly pinnedAt?: Date;
  readonly pinnedBy?: string;

  // ===== DELIVERY STATUS (denormalized) =====
  readonly deliveredToAllAt?: Date;
  readonly receivedByAllAt?: Date;
  readonly readByAllAt?: Date;
  readonly deliveredCount: number;
  readonly readCount: number;

  // ===== REACTION SUMMARY (denormalized) =====
  readonly reactionSummary?: Record<string, number>;
  readonly reactionCount: number;

  // ===== E2EE / ENCRYPTION =====
  readonly encryptedContent?: string;
  readonly encryptionMode?: EncryptionMode;
  readonly encryptionMetadata?: Record<string, unknown>;
  readonly isEncrypted: boolean;

  // ===== METADONNEES =====
  readonly createdAt: Date;
  readonly updatedAt?: Date;

  // ===== MENTIONS =====
  readonly validatedMentions?: readonly string[];
  readonly mentionedUsers?: readonly MentionedUser[];

  // ===== EXPEDITEUR =====
  readonly sender?: Participant;

  // ===== TRADUCTIONS =====
  readonly translations: readonly MessageTranslation[];

  // ===== ATTACHMENTS =====
  readonly attachments?: readonly Attachment[];

  // ===== COMPATIBILITE =====
  readonly timestamp: Date;

  // ===== PARTICIPANT ANONYME =====
  /** @deprecated Use sender (Participant) instead */
  readonly anonymousSender?: AnonymousSenderInfo;
}

/**
 * Statut de lecture pour un message
 */
export interface MessageReadStatus {
  readonly participantId: string;
  readonly readAt: Date;
}

/**
 * MESSAGE AVEC TRADUCTIONS - Message enrichi avec traductions et etats UI
 */
export interface MessageWithTranslations extends Message {
  readonly uiTranslations: readonly UITranslationState[];
  readonly translatingLanguages: readonly string[];
  readonly currentDisplayLanguage: string;
  readonly showingOriginal: boolean;
  readonly originalContent: string;
  readonly readStatus?: readonly MessageReadStatus[];
  readonly location?: string;
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
 * Visibilite de conversation
 */
export type ConversationVisibility = 'public' | 'private' | 'restricted';

/**
 * Type de lien de conversation
 */
export type ConversationLinkType = 'invite' | 'share' | 'embed';

/**
 * Role minimum requis pour envoyer des messages dans une conversation
 */
export type ConversationWriteRole = 'everyone' | 'member' | 'moderator' | 'admin' | 'creator';

/**
 * Permissions administratives d'un participant dans une conversation
 * (invite, remove, edit, moderate capabilities)
 */
export interface ConversationAdminPermissions {
  readonly canInvite: boolean;
  readonly canRemove: boolean;
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  readonly canModerate: boolean;
}

/**
 * @deprecated Use ConversationAdminPermissions for admin perms, or ParticipantPermissions from participant.ts for send perms
 */
export type LegacyParticipantPermissions = ConversationAdminPermissions;

/**
 * Parametres d'une conversation
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
 * Conversation unifiee
 * Aligned with schema.prisma Conversation model
 */
export interface Conversation {
  // ===== IDENTIFIANTS =====
  readonly id: string;
  readonly identifier?: string;

  // ===== METADONNEES =====
  readonly title?: string;
  readonly description?: string;
  readonly type: ConversationType;
  readonly status: ConversationStatus;
  readonly visibility: ConversationVisibility;
  readonly image?: string;
  readonly avatar?: string;
  readonly banner?: string;

  // ===== COMMUNITY =====
  readonly communityId?: string;
  readonly isActive: boolean;
  readonly isArchived?: boolean;
  readonly memberCount: number;

  // ===== LEGACY COMPATIBILITY =====
  readonly isGroup?: boolean;
  readonly isPrivate?: boolean;

  // ===== PARTICIPANTS (unified) =====
  readonly participants: readonly Participant[];

  // ===== USER PREFERENCES =====
  readonly userPreferences?: unknown;

  // ===== MESSAGES =====
  readonly lastMessage?: Message;
  readonly lastMessageAt?: Date;
  readonly messageCount?: number;
  readonly unreadCount?: number;

  // ===== E2EE / ENCRYPTION =====
  readonly encryptionMode?: EncryptionMode;
  readonly encryptionProtocol?: string;
  readonly encryptionEnabledAt?: Date;
  readonly encryptionEnabledBy?: string;
  readonly serverEncryptionKeyId?: string;
  readonly autoTranslateEnabled?: boolean;

  // ===== WRITE PERMISSIONS =====
  readonly defaultWriteRole?: ConversationWriteRole;
  readonly isAnnouncementChannel?: boolean;
  readonly slowModeSeconds?: number;

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

  // ===== CREATEUR =====
  readonly createdBy?: string;
  readonly createdByUser?: User;
}

/**
 * @deprecated Use Participant instead
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
  readonly permissions?: ConversationAdminPermissions;
}

/**
 * Traduction individuelle dans MessageTranslationPayload
 */
export interface TranslationItem {
  readonly targetLanguage: string;
  readonly translatedContent: string;
  readonly confidence?: number;
  readonly model?: TranslationModel;
  readonly fromCache: boolean;
}

/**
 * Donnees de traduction recues via Socket.IO
 * @deprecated Use TranslationData from socketio-events.ts for socket payloads
 */
export interface MessageTranslationPayload {
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
  readonly allowAnonymousMessages?: boolean;
  readonly allowAnonymousFiles?: boolean;
  readonly allowAnonymousImages?: boolean;
  readonly allowViewHistory?: boolean;
  readonly requireAccount?: boolean;
  readonly requireNickname?: boolean;
  readonly requireEmail?: boolean;
  readonly requireBirthday?: boolean;
}

// ===== CONVERSATION PARTICIPANT =====

/**
 * @deprecated Use Participant from participant.ts instead
 */
export interface ConversationParticipantInfo {
  readonly userId: string;
  readonly role: UserRole;
  readonly joinedAt: Date;
  readonly isActive: boolean;
  readonly permissions?: ConversationAdminPermissions;
  readonly user?: unknown;
}

/**
 * @deprecated Use Participant from participant.ts instead
 */
export interface ConversationParticipant {
  readonly userId: string;
  readonly role: UserRole;
  readonly joinedAt: Date;
  readonly isActive: boolean;
  readonly permissions?: ConversationAdminPermissions;
}

// ===== TYPE ALIASES FOR COMPATIBILITY =====
export type BubbleStreamMessage = MessageWithTranslations;

// ===== STATUS ENTRY TYPES (MessageStatusEntry canonical definition in message-types.ts) =====

/**
 * Per-participant attachment consumption status
 * Aligned with schema.prisma AttachmentStatusEntry
 */
export interface AttachmentStatusEntry {
  readonly id: string;
  readonly attachmentId: string;
  readonly conversationId: string;
  readonly participantId: string;

  // Delivery & consumption timestamps
  readonly deliveredAt?: Date;
  readonly viewedAt?: Date;
  readonly downloadedAt?: Date;
  readonly listenedAt?: Date;
  readonly watchedAt?: Date;

  // Consumption metrics
  readonly playbackPosition?: number;
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
  readonly participantId: string;

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
  readonly participantId: string;
  readonly emoji: string;
  readonly createdAt: Date;
}

// ===== CONVERSATION SHARE =====

/**
 * Partage d'une conversation vers une communaute
 * Aligned with schema.prisma ConversationShare
 */
export interface ConversationShare {
  readonly id: string;
  readonly conversationId: string;
  readonly communityId: string;
  readonly sharedBy: string;
  readonly title?: string;
  readonly description?: string;
  readonly isPinned: boolean;
  readonly pinOrder?: number;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly conversation?: Conversation;
  readonly sharer?: User;
}

/**
 * DTO pour creer un partage de conversation
 */
export interface CreateConversationShareDTO {
  readonly conversationId: string;
  readonly communityId: string;
  readonly title?: string;
  readonly description?: string;
  readonly isPinned?: boolean;
}

/**
 * DTO pour mettre a jour un partage
 */
export interface UpdateConversationShareDTO {
  readonly title?: string;
  readonly description?: string;
  readonly isPinned?: boolean;
  readonly pinOrder?: number;
  readonly isActive?: boolean;
}

// ===== CONVERSATION MEMBER (DEPRECATED) =====

/**
 * @deprecated Use Participant from participant.ts instead
 */
export interface ConversationMember {
  readonly id: string;
  readonly conversationId: string;
  readonly userId: string;
  readonly role: MemberRoleType | string;
  readonly nickname?: string;
  readonly canSendMessage: boolean;
  readonly canSendFiles: boolean;
  readonly canSendImages: boolean;
  readonly canSendVideos: boolean;
  readonly canSendAudios: boolean;
  readonly canSendLocations: boolean;
  readonly canSendLinks: boolean;
  readonly joinedAt: Date;
  readonly leftAt?: Date;
  readonly isActive: boolean;
  readonly user?: User;
  readonly conversation?: Conversation;
}

/**
 * @deprecated Use Participant from participant.ts instead
 */
export type ConversationMemberCompat = ConversationMember;

/**
 * DTO pour ajouter un participant a une conversation
 */
export interface AddParticipantDTO {
  readonly userId?: string;
  readonly type?: 'user' | 'anonymous' | 'bot';
  readonly role?: MemberRoleType;
  readonly nickname?: string;
  readonly displayName?: string;
  readonly language?: string;
}

/**
 * @deprecated Use AddParticipantDTO instead
 */
export type AddConversationMemberDTO = AddParticipantDTO;

/**
 * DTO pour mettre a jour un participant
 */
export interface UpdateParticipantDTO {
  readonly role?: MemberRoleType;
  readonly nickname?: string;
  readonly permissions?: {
    readonly canSendMessages?: boolean;
    readonly canSendFiles?: boolean;
    readonly canSendImages?: boolean;
    readonly canSendVideos?: boolean;
    readonly canSendAudios?: boolean;
    readonly canSendLocations?: boolean;
    readonly canSendLinks?: boolean;
  };
  readonly isActive?: boolean;
}

/**
 * @deprecated Use UpdateParticipantDTO instead
 */
export type UpdateConversationMemberDTO = UpdateParticipantDTO;

// ===== CONVERSATION PREFERENCE =====

/**
 * Preference de conversation (cle/valeur)
 * Aligned with schema.prisma ConversationPreference
 */
export interface ConversationPreference {
  readonly id: string;
  readonly conversationId: string;
  readonly userId: string;
  readonly key: string;
  readonly value: string;
  readonly valueType: 'string' | 'number' | 'boolean' | 'json';
  readonly description?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * DTO pour creer une preference
 */
export interface CreateConversationPreferenceDTO {
  readonly conversationId: string;
  readonly key: string;
  readonly value: string;
  readonly valueType?: 'string' | 'number' | 'boolean' | 'json';
  readonly description?: string;
}

/**
 * DTO pour mettre a jour une preference
 */
export interface UpdateConversationPreferenceDTO {
  readonly value?: string;
  readonly valueType?: 'string' | 'number' | 'boolean' | 'json';
  readonly description?: string;
}

/**
 * Collection de preferences d'un utilisateur pour une conversation
 */
export interface UserConversationPreferencesMap {
  readonly conversationId: string;
  readonly userId: string;
  readonly preferences: Record<string, ConversationPreference>;
}

// ===== TYPE GUARDS =====

/**
 * Verifie si un membre est un admin
 */
export function isMemberAdmin(member: { role: MemberRoleType | string }): boolean {
  return isMemberAdminRole(member.role as string);
}

/**
 * Verifie si un membre est un moderateur ou plus
 */
export function isMemberModerator(member: { role: MemberRoleType | string }): boolean {
  return isMemberModeratorRole(member.role as MemberRoleType);
}

/**
 * Verifie si un membre est un createur
 */
export function isMemberCreator(member: { role: MemberRoleType | string }): boolean {
  const normalized = typeof member.role === 'string' ? member.role.toLowerCase() : member.role;
  return normalized === 'creator';
}

/**
 * Verifie si un participant peut envoyer des messages
 */
export function canParticipantSendMessage(participant: Participant): boolean {
  return participant.isActive && participant.permissions.canSendMessages;
}

/**
 * @deprecated Use canParticipantSendMessage instead
 */
export function canMemberSendMessage(member: ConversationMember): boolean {
  return member.isActive && member.canSendMessage;
}
