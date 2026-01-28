/**
 * Types pour les notifications utilisateur
 * Architecture groupée logiquement pour meilleure organisation
 *
 * IMPORTANT: Le titre est construit dynamiquement côté frontend via i18n
 * à partir du `type`, `actor`, `context` et `metadata`.
 */

// =====================================================
// NOTIFICATION TYPES & ENUMS
// =====================================================

/**
 * Types de notifications supportés - ENUM complet
 */
export enum NotificationTypeEnum {
  // ===== MESSAGE EVENTS =====
  NEW_MESSAGE = 'new_message',
  MESSAGE_REPLY = 'message_reply',
  MESSAGE_EDITED = 'message_edited',
  MESSAGE_DELETED = 'message_deleted',
  MESSAGE_PINNED = 'message_pinned',
  MESSAGE_UNPINNED = 'message_unpinned',
  MESSAGE_FORWARDED = 'message_forwarded',

  // ===== CONVERSATION EVENTS =====
  NEW_CONVERSATION = 'new_conversation',
  NEW_CONVERSATION_DIRECT = 'new_conversation_direct',
  NEW_CONVERSATION_GROUP = 'new_conversation_group',
  CONVERSATION_ARCHIVED = 'conversation_archived',
  CONVERSATION_UNARCHIVED = 'conversation_unarchived',
  CONVERSATION_DELETED = 'conversation_deleted',
  CONVERSATION_SETTINGS_CHANGED = 'conversation_settings_changed',
  ADDED_TO_CONVERSATION = 'added_to_conversation',
  REMOVED_FROM_CONVERSATION = 'removed_from_conversation',
  CONVERSATION_ENCRYPTION_ENABLED = 'conversation_encryption_enabled',

  // ===== MEMBER/GROUP EVENTS =====
  MEMBER_JOINED = 'member_joined',
  MEMBER_LEFT = 'member_left',
  MEMBER_REMOVED = 'member_removed',
  MEMBER_PROMOTED = 'member_promoted',
  MEMBER_DEMOTED = 'member_demoted',
  MEMBER_ROLE_CHANGED = 'member_role_changed',

  // ===== CONTACT/FRIEND EVENTS =====
  CONTACT_REQUEST = 'contact_request',
  CONTACT_ACCEPTED = 'contact_accepted',
  CONTACT_REJECTED = 'contact_rejected',
  CONTACT_BLOCKED = 'contact_blocked',
  CONTACT_UNBLOCKED = 'contact_unblocked',
  FRIEND_REQUEST = 'friend_request',
  FRIEND_ACCEPTED = 'friend_accepted',

  // ===== INTERACTION EVENTS =====
  USER_MENTIONED = 'user_mentioned',
  MENTION = 'mention',
  MESSAGE_REACTION = 'message_reaction',
  REACTION = 'reaction',
  REPLY = 'reply',

  // ===== CALL EVENTS =====
  MISSED_CALL = 'missed_call',
  INCOMING_CALL = 'incoming_call',
  CALL_ENDED = 'call_ended',
  CALL_DECLINED = 'call_declined',
  CALL_RECORDING_READY = 'call_recording_ready',

  // ===== TRANSLATION/AUDIO EVENTS =====
  TRANSLATION_COMPLETED = 'translation_completed',
  TRANSLATION_FAILED = 'translation_failed',
  TRANSLATION_READY = 'translation_ready',
  TRANSCRIPTION_COMPLETED = 'transcription_completed',
  TRANSCRIPTION_FAILED = 'transcription_failed',
  VOICE_CLONE_READY = 'voice_clone_ready',
  VOICE_CLONE_FAILED = 'voice_clone_failed',
  AUDIO_MESSAGE_TRANSLATED = 'audio_message_translated',

  // ===== SECURITY/ACCOUNT EVENTS =====
  SECURITY_ALERT = 'security_alert',
  LOGIN_NEW_DEVICE = 'login_new_device',
  LOGIN_SUSPICIOUS = 'login_suspicious',
  PASSWORD_CHANGED = 'password_changed',
  PASSWORD_RESET_REQUESTED = 'password_reset_requested',
  EMAIL_VERIFIED = 'email_verified',
  PHONE_VERIFIED = 'phone_verified',
  TWO_FACTOR_ENABLED = 'two_factor_enabled',
  TWO_FACTOR_DISABLED = 'two_factor_disabled',
  SESSION_EXPIRED = 'session_expired',
  ACCOUNT_LOCKED = 'account_locked',
  ACCOUNT_UNLOCKED = 'account_unlocked',

  // ===== MODERATION EVENTS =====
  CONTENT_FLAGGED = 'content_flagged',
  CONTENT_REMOVED = 'content_removed',
  REPORT_SUBMITTED = 'report_submitted',
  REPORT_RESOLVED = 'report_resolved',
  WARNING_RECEIVED = 'warning_received',

  // ===== FILE/ATTACHMENT EVENTS =====
  FILE_SHARED = 'file_shared',
  FILE_UPLOAD_COMPLETED = 'file_upload_completed',
  FILE_UPLOAD_FAILED = 'file_upload_failed',
  FILE_SCAN_COMPLETED = 'file_scan_completed',

  // ===== COMMUNITY EVENTS =====
  COMMUNITY_INVITE = 'community_invite',
  COMMUNITY_JOINED = 'community_joined',
  COMMUNITY_LEFT = 'community_left',
  COMMUNITY_ANNOUNCEMENT = 'community_announcement',
  COMMUNITY_ROLE_CHANGED = 'community_role_changed',

  // ===== SYSTEM EVENTS =====
  SYSTEM = 'system',
  MAINTENANCE = 'maintenance',
  UPDATE_AVAILABLE = 'update_available',
  FEATURE_ANNOUNCEMENT = 'feature_announcement',
  TERMS_UPDATED = 'terms_updated',
  PRIVACY_UPDATED = 'privacy_updated',

  // ===== ENGAGEMENT/GAMIFICATION =====
  ACHIEVEMENT_UNLOCKED = 'achievement_unlocked',
  STREAK_MILESTONE = 'streak_milestone',
  LEVEL_UP = 'level_up',
  BADGE_EARNED = 'badge_earned',

  // ===== PAYMENT/SUBSCRIPTION =====
  SUBSCRIPTION_EXPIRING = 'subscription_expiring',
  SUBSCRIPTION_RENEWED = 'subscription_renewed',
  PAYMENT_RECEIVED = 'payment_received',
  PAYMENT_FAILED = 'payment_failed',
}

/**
 * Type union de tous les types de notifications
 */
export type NotificationType = `${NotificationTypeEnum}` | string;

/**
 * Priorité de notification
 */
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

// =====================================================
// STRUCTURE GROUPÉE LOGIQUEMENT
// =====================================================

/**
 * ACTOR - Qui a déclenché la notification
 * Informations sur l'utilisateur qui a effectué l'action
 */
export interface NotificationActor {
  readonly id: string;
  readonly username: string;
  readonly displayName?: string | null;
  readonly avatar?: string | null;
}

/**
 * CONTEXT - Où c'est arrivé
 * Contexte de navigation pour la notification
 */
export interface NotificationContext {
  readonly conversationId?: string;
  readonly conversationTitle?: string;
  readonly conversationType?: 'direct' | 'group' | 'public' | 'global' | 'broadcast';
  readonly messageId?: string;
  readonly originalMessageId?: string;
  readonly callSessionId?: string;
  readonly friendRequestId?: string;
  readonly reactionId?: string;
}

/**
 * STATE - Statut de lecture
 * État de la notification
 */
export interface NotificationState {
  readonly isRead: boolean;
  readonly readAt: Date | null;
  readonly createdAt: Date;
  readonly expiresAt?: Date;
}

/**
 * DELIVERY - Suivi multi-canal
 * Statut d'envoi des notifications
 */
export interface NotificationDelivery {
  readonly emailSent: boolean;
  readonly pushSent: boolean;
}

// =====================================================
// METADATA - Type-specific data (Discriminated Unions)
// =====================================================

/**
 * Metadata de base commune à toutes les notifications
 */
interface BaseNotificationMetadata {
  readonly action?: 'view_message' | 'view_conversation' | 'join_conversation' | 'accept_or_reject_contact' | 'open_call' | 'view_details' | 'update_app' | 'none';
}

/**
 * Metadata pour new_message
 */
export interface MessageNotificationMetadata extends BaseNotificationMetadata {
  readonly messagePreview: string;
  readonly attachments?: {
    readonly count: number;
    readonly firstType: 'image' | 'video' | 'audio' | 'document' | 'text' | 'code';
    readonly firstFilename: string;
  };
  readonly action: 'view_message';
}

/**
 * Metadata pour user_mentioned
 */
export interface MentionNotificationMetadata extends BaseNotificationMetadata {
  readonly messagePreview: string;
  readonly action: 'view_message';
}

/**
 * Metadata pour message_reaction
 */
export interface ReactionNotificationMetadata extends BaseNotificationMetadata {
  readonly reactionEmoji: string;
  readonly action: 'view_message';
}

/**
 * Metadata pour missed_call / call_declined
 */
export interface CallNotificationMetadata extends BaseNotificationMetadata {
  readonly callType: 'audio' | 'video';
  readonly action: 'view_conversation';
}

/**
 * Metadata pour friend_request_received
 */
export interface FriendRequestNotificationMetadata extends BaseNotificationMetadata {
  readonly action: 'accept_or_reject_contact';
}

/**
 * Metadata pour friend_request_accepted
 */
export interface FriendAcceptedNotificationMetadata extends BaseNotificationMetadata {
  readonly action: 'view_conversation';
}

/**
 * Metadata pour user_joined_conversation / user_left_conversation
 */
export interface MemberEventNotificationMetadata extends BaseNotificationMetadata {
  readonly memberCount?: number;
  readonly isMember?: boolean;
  readonly joinMethod?: 'via_link' | 'invited';
  readonly action: 'view_conversation';
}

/**
 * Metadata pour conversation_created
 */
export interface ConversationCreatedNotificationMetadata extends BaseNotificationMetadata {
  readonly memberCount?: number;
  readonly action: 'view_conversation' | 'join_conversation';
}

/**
 * Metadata pour translation_ready
 */
export interface TranslationNotificationMetadata extends BaseNotificationMetadata {
  readonly action: 'view_message';
}

/**
 * Metadata pour system_announcement
 */
export interface SystemNotificationMetadata extends BaseNotificationMetadata {
  readonly systemType?: 'maintenance' | 'security' | 'announcement' | 'feature';
  readonly action: 'view_details' | 'update_app' | 'none';
}

/**
 * Metadata générique pour autres types
 */
export interface GenericNotificationMetadata extends BaseNotificationMetadata {
  readonly [key: string]: unknown;
}

/**
 * Union discriminée de tous les types de metadata
 */
export type NotificationMetadata =
  | MessageNotificationMetadata
  | MentionNotificationMetadata
  | ReactionNotificationMetadata
  | CallNotificationMetadata
  | FriendRequestNotificationMetadata
  | FriendAcceptedNotificationMetadata
  | MemberEventNotificationMetadata
  | ConversationCreatedNotificationMetadata
  | TranslationNotificationMetadata
  | SystemNotificationMetadata
  | GenericNotificationMetadata;

// =====================================================
// NOTIFICATION - MAIN INTERFACE
// =====================================================

/**
 * Notification - Structure groupée logiquement
 *
 * IMPORTANT: Pas de champ `title` - construit dynamiquement côté frontend via i18n
 */
export interface Notification {
  // === CORE - Identité ===
  readonly id: string;
  readonly userId: string;
  readonly type: NotificationType;
  readonly priority: NotificationPriority;

  // === CONTENT - Ce qui est affiché ===
  readonly content: string; // Message preview ou contenu principal

  // === ACTOR - Qui a déclenché (optionnel) ===
  readonly actor?: NotificationActor;

  // === CONTEXT - Où c'est arrivé ===
  readonly context: NotificationContext;

  // === METADATA - Données type-spécifiques ===
  readonly metadata: NotificationMetadata;

  // === STATE - Statut ===
  readonly state: NotificationState;

  // === DELIVERY - Suivi multi-canal ===
  readonly delivery: NotificationDelivery;
}

// =====================================================
// TYPE GUARDS
// =====================================================

/**
 * Type guard pour new_message
 */
export function isMessageNotification(n: Notification): n is Notification & { metadata: MessageNotificationMetadata } {
  return n.type === 'new_message';
}

/**
 * Type guard pour user_mentioned
 */
export function isMentionNotification(n: Notification): n is Notification & { metadata: MentionNotificationMetadata } {
  return n.type === 'user_mentioned' || n.type === 'mention';
}

/**
 * Type guard pour message_reaction
 */
export function isReactionNotification(n: Notification): n is Notification & { metadata: ReactionNotificationMetadata } {
  return n.type === 'message_reaction' || n.type === 'reaction';
}

/**
 * Type guard pour missed_call / call_declined
 */
export function isCallNotification(n: Notification): n is Notification & { metadata: CallNotificationMetadata } {
  return n.type === 'missed_call' || n.type === 'call_declined' || n.type === 'incoming_call';
}

/**
 * Type guard pour friend_request_received
 */
export function isFriendRequestNotification(n: Notification): n is Notification & { metadata: FriendRequestNotificationMetadata } {
  return n.type === 'friend_request' || n.type === 'contact_request';
}

/**
 * Type guard pour member events
 */
export function isMemberEventNotification(n: Notification): n is Notification & { metadata: MemberEventNotificationMetadata } {
  return n.type === 'member_joined' || n.type === 'member_left' || n.type === 'added_to_conversation' || n.type === 'removed_from_conversation';
}

/**
 * Type guard pour system notifications
 */
export function isSystemNotification(n: Notification): n is Notification & { metadata: SystemNotificationMetadata } {
  return n.type === 'system' || n.type === 'security_alert' || n.type === 'maintenance';
}

// =====================================================
// DTOs
// =====================================================

/**
 * DTO pour créer une notification
 */
export interface CreateNotificationDTO {
  readonly userId: string;
  readonly type: NotificationType;
  readonly priority?: NotificationPriority;
  readonly content: string;
  readonly actor?: NotificationActor;
  readonly context: NotificationContext;
  readonly metadata: NotificationMetadata;
  readonly expiresAt?: Date;
}

/**
 * DTO pour mettre à jour une notification
 */
export interface UpdateNotificationDTO {
  readonly isRead?: boolean;
  readonly readAt?: Date;
  readonly emailSent?: boolean;
  readonly pushSent?: boolean;
}

/**
 * Filtres pour rechercher des notifications
 */
export interface NotificationFilters {
  readonly userId?: string;
  readonly type?: NotificationType | 'all';
  readonly isRead?: boolean;
  readonly priority?: NotificationPriority;
  readonly conversationId?: string;
  readonly senderId?: string;
  readonly startDate?: Date;
  readonly endDate?: Date;
  readonly limit?: number;
  readonly offset?: number;
  readonly sortBy?: 'createdAt' | 'priority' | 'readAt';
  readonly sortOrder?: 'asc' | 'desc';
}

/**
 * Réponse paginée pour les notifications
 */
export interface NotificationResponse {
  readonly notifications: readonly Notification[];
  readonly pagination: {
    readonly total: number;
    readonly offset: number;
    readonly limit: number;
    readonly hasMore: boolean;
  };
  readonly unreadCount: number;
}

// =====================================================
// NOTIFICATION PREFERENCES
// =====================================================

/**
 * Préférences de notifications utilisateur
 */
export interface NotificationPreference {
  readonly id: string;
  readonly userId: string;

  // === GLOBAL SETTINGS ===
  readonly pushEnabled: boolean;
  readonly emailEnabled: boolean;
  readonly soundEnabled: boolean;

  // === PER-TYPE SETTINGS ===
  readonly newMessageEnabled: boolean;
  readonly missedCallEnabled: boolean;
  readonly systemEnabled: boolean;
  readonly conversationEnabled: boolean;
  readonly replyEnabled: boolean;
  readonly mentionEnabled: boolean;
  readonly reactionEnabled: boolean;
  readonly contactRequestEnabled: boolean;
  readonly memberJoinedEnabled: boolean;

  // === DO NOT DISTURB ===
  readonly dndEnabled: boolean;
  readonly dndStartTime?: string;
  readonly dndEndTime?: string;

  // === MUTED CONVERSATIONS ===
  readonly mutedConversations?: readonly string[];

  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * DTO pour créer des préférences
 */
export interface CreateNotificationPreferenceDTO {
  readonly userId: string;
  readonly pushEnabled?: boolean;
  readonly emailEnabled?: boolean;
  readonly soundEnabled?: boolean;
  readonly newMessageEnabled?: boolean;
  readonly missedCallEnabled?: boolean;
  readonly systemEnabled?: boolean;
  readonly conversationEnabled?: boolean;
  readonly replyEnabled?: boolean;
  readonly mentionEnabled?: boolean;
  readonly reactionEnabled?: boolean;
  readonly contactRequestEnabled?: boolean;
  readonly memberJoinedEnabled?: boolean;
  readonly dndEnabled?: boolean;
  readonly dndStartTime?: string;
  readonly dndEndTime?: string;
}

/**
 * DTO pour mettre à jour des préférences
 */
export interface UpdateNotificationPreferenceDTO {
  readonly pushEnabled?: boolean;
  readonly emailEnabled?: boolean;
  readonly soundEnabled?: boolean;
  readonly newMessageEnabled?: boolean;
  readonly missedCallEnabled?: boolean;
  readonly systemEnabled?: boolean;
  readonly conversationEnabled?: boolean;
  readonly replyEnabled?: boolean;
  readonly mentionEnabled?: boolean;
  readonly reactionEnabled?: boolean;
  readonly contactRequestEnabled?: boolean;
  readonly memberJoinedEnabled?: boolean;
  readonly dndEnabled?: boolean;
  readonly dndStartTime?: string;
  readonly dndEndTime?: string;
}

// =====================================================
// UTILITIES
// =====================================================

/**
 * Vérifie si une notification est expirée
 */
export function isNotificationExpired(notification: Notification): boolean {
  if (!notification.state.expiresAt) {
    return false;
  }
  return new Date() > notification.state.expiresAt;
}

/**
 * Vérifie si une notification est non lue et valide
 */
export function isNotificationUnread(notification: Notification): boolean {
  return !notification.state.isRead && !isNotificationExpired(notification);
}

/**
 * Vérifie si le mode DND est actif
 */
export function isDNDActive(prefs: NotificationPreference): boolean {
  if (!prefs.dndEnabled) {
    return false;
  }

  if (!prefs.dndStartTime || !prefs.dndEndTime) {
    return prefs.dndEnabled;
  }

  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  const start = prefs.dndStartTime;
  const end = prefs.dndEndTime;

  // Handle overnight DND (e.g., 22:00 - 08:00)
  if (start > end) {
    return currentTime >= start || currentTime < end;
  }

  // Normal DND (e.g., 14:00 - 16:00)
  return currentTime >= start && currentTime < end;
}

/**
 * Vérifie si un type de notification est activé
 */
export function isNotificationTypeEnabled(
  prefs: NotificationPreference,
  type: NotificationType | string
): boolean {
  switch (type) {
    case 'new_message':
      return prefs.newMessageEnabled;
    case 'missed_call':
      return prefs.missedCallEnabled;
    case 'system':
    case 'security_alert':
      return prefs.systemEnabled;
    case 'new_conversation':
      return prefs.conversationEnabled;
    case 'reply':
      return prefs.replyEnabled;
    case 'mention':
    case 'user_mentioned':
      return prefs.mentionEnabled;
    case 'reaction':
    case 'message_reaction':
      return prefs.reactionEnabled;
    case 'contact_request':
    case 'friend_request':
    case 'contact_accepted':
      return prefs.contactRequestEnabled;
    case 'member_joined':
    case 'member_left':
      return prefs.memberJoinedEnabled;
    default:
      return true;
  }
}

/**
 * Détermine si une notification doit être envoyée
 */
export function shouldSendNotification(
  prefs: NotificationPreference,
  type: NotificationType | string,
  channel: 'push' | 'email'
): boolean {
  if (channel === 'push' && !prefs.pushEnabled) {
    return false;
  }
  if (channel === 'email' && !prefs.emailEnabled) {
    return false;
  }

  if (!isNotificationTypeEnabled(prefs, type)) {
    return false;
  }

  if (type !== 'security_alert' && isDNDActive(prefs)) {
    return false;
  }

  return true;
}

/**
 * Crée les préférences par défaut
 */
export function getDefaultNotificationPreferences(userId: string): CreateNotificationPreferenceDTO {
  return {
    userId,
    pushEnabled: true,
    emailEnabled: true,
    soundEnabled: true,
    newMessageEnabled: true,
    missedCallEnabled: true,
    systemEnabled: true,
    conversationEnabled: true,
    replyEnabled: true,
    mentionEnabled: true,
    reactionEnabled: true,
    contactRequestEnabled: true,
    memberJoinedEnabled: true,
    dndEnabled: false,
  };
}
