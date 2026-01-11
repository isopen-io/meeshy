/**
 * Types pour les notifications utilisateur
 * Alignés avec les modèles Prisma: Notification, NotificationPreference
 *
 * Ces types gèrent les notifications push, email et in-app
 * ainsi que les préférences utilisateur.
 */

// =====================================================
// NOTIFICATION TYPES & ENUMS
// =====================================================

/**
 * Types de notifications supportés - ENUM complet
 * Synchronisé avec les besoins frontend et backend
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
 * Pour rétrocompatibilité avec le code existant
 */
export type NotificationType = `${NotificationTypeEnum}` | string;

/**
 * Priorité de notification - ENUM
 */
export enum NotificationPriorityEnum {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

/**
 * Priorité de notification - type union
 */
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

// =====================================================
// NOTIFICATION
// =====================================================

/**
 * Types de conversations pour les notifications
 */
export type NotificationConversationType = 'direct' | 'group' | 'public' | 'global' | 'broadcast';

/**
 * Types d'attachments pour les notifications
 */
export type NotificationAttachmentType = 'image' | 'video' | 'audio' | 'document' | 'text' | 'code';

/**
 * Actions possibles pour les notifications
 */
export type NotificationAction =
  | 'view_message'
  | 'view_conversation'
  | 'join_conversation'
  | 'accept_or_reject_contact'
  | 'open_call'
  | 'view_details'
  | 'update_app'
  | 'none';

/**
 * Informations sur l'expéditeur d'une notification - NESTED structure
 * Ordre de priorité pour l'affichage:
 * 1. displayName (si existe)
 * 2. firstName + lastName
 * 3. username (fallback)
 */
export interface NotificationSender {
  readonly id: string;
  readonly username: string;
  readonly displayName?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly avatar?: string;
}

/**
 * Informations sur l'expéditeur - structure plate (legacy)
 * @deprecated Utilisez NotificationSender à la place
 */
export interface NotificationSenderInfo {
  readonly senderId?: string;
  readonly senderUsername?: string;
  readonly senderAvatar?: string;
  readonly senderDisplayName?: string;
  readonly senderFirstName?: string;
  readonly senderLastName?: string;
}

/**
 * Contexte de navigation pour les notifications
 */
export interface NotificationContext {
  readonly conversationId?: string;
  readonly conversationTitle?: string;
  readonly conversationType?: NotificationConversationType;
  readonly messageId?: string;
  readonly originalMessageId?: string;
  readonly callSessionId?: string;
  readonly friendRequestId?: string;
  readonly reactionId?: string;
}

/**
 * Métadonnées enrichies pour l'UI
 */
export interface NotificationMetadata {
  readonly attachments?: {
    readonly count: number;
    readonly firstType: NotificationAttachmentType;
    readonly firstFilename: string;
  } | readonly any[];
  readonly reactionEmoji?: string;
  readonly memberCount?: number;
  readonly action?: NotificationAction;
  readonly joinMethod?: 'via_link' | 'invited';
  readonly systemType?: 'maintenance' | 'security' | 'announcement' | 'feature';
  readonly isMember?: boolean;
  /** Type d'appel pour les notifications d'appels manqués */
  readonly callType?: 'audio' | 'video';
}

/**
 * Notification utilisateur - structure unifiée
 * Aligned with schema.prisma Notification + frontend requirements
 *
 * IMPORTANT: Le backend ne doit PAS construire le `title`.
 * Le frontend construit le titre via `buildNotificationTitle(notification)`
 * à partir du `type` et des données brutes (`sender`, `context`, `metadata`).
 */
export interface Notification {
  readonly id: string;

  /** Utilisateur destinataire */
  readonly userId: string;

  /** Type de notification (new_message, missed_call, etc.) */
  readonly type: NotificationType;

  /** Priorité (low, normal, high, urgent) */
  readonly priority: NotificationPriority;

  /** Si la notification a été lue */
  readonly isRead: boolean;

  /** Quand la notification a été lue */
  readonly readAt?: Date;

  /** Date de création */
  readonly createdAt: Date;

  /** Date d'expiration (optionnelle) */
  readonly expiresAt?: Date;

  // === SENDER INFO (NESTED - preferred) ===

  /** Informations de l'expéditeur (utilisées pour construire le titre) */
  readonly sender?: NotificationSender;

  // === SENDER INFO (FLAT - legacy, for Prisma compatibility) ===

  /** @deprecated Utilisez sender.id à la place */
  readonly senderId?: string;

  /** @deprecated Utilisez sender.username à la place */
  readonly senderUsername?: string;

  /** @deprecated Utilisez sender.avatar à la place */
  readonly senderAvatar?: string;

  /** @deprecated Utilisez sender.displayName à la place */
  readonly senderDisplayName?: string;

  /** @deprecated Utilisez sender.firstName à la place */
  readonly senderFirstName?: string;

  /** @deprecated Utilisez sender.lastName à la place */
  readonly senderLastName?: string;

  // === CONTEXT (NESTED - preferred) ===

  /** Contexte de navigation (utilisé pour construire le titre) */
  readonly context?: NotificationContext;

  // === CONTEXT (FLAT - legacy, for Prisma compatibility) ===

  /** @deprecated Utilisez context.conversationId à la place */
  readonly conversationId?: string;

  /** @deprecated Utilisez context.messageId à la place */
  readonly messageId?: string;

  /** @deprecated Utilisez context.callSessionId à la place */
  readonly callSessionId?: string;

  // === CONTENT ===

  /** Aperçu du message */
  readonly messagePreview?: string;

  /** Métadonnées enrichies (utilisées pour construire le titre) */
  readonly metadata?: NotificationMetadata;

  /** Données brutes pour compatibilité (JSON object) */
  readonly data?: Record<string, unknown>;

  // === TITLE/CONTENT (deprecated for new code) ===

  /** @deprecated Le frontend construit le titre à partir du type + données brutes */
  readonly title?: string;

  /** @deprecated Fallback ou contenu additionnel */
  readonly content?: string;

  // === DELIVERY STATUS (backend-only) ===

  /** Si un email a été envoyé */
  readonly emailSent?: boolean;

  /** Si une notification push a été envoyée */
  readonly pushSent?: boolean;
}

/**
 * DTO pour créer une notification
 */
export interface CreateNotificationDTO {
  readonly userId: string;
  readonly type: NotificationType;
  readonly priority?: NotificationPriority;
  readonly expiresAt?: Date;

  // Sender info (nested preferred)
  readonly sender?: NotificationSender;

  // Sender info (flat legacy)
  readonly senderId?: string;
  readonly senderUsername?: string;
  readonly senderAvatar?: string;
  readonly senderDisplayName?: string;
  readonly senderFirstName?: string;
  readonly senderLastName?: string;

  // Context (nested preferred)
  readonly context?: NotificationContext;

  // Context (flat legacy)
  readonly conversationId?: string;
  readonly messageId?: string;
  readonly callSessionId?: string;

  // Content
  readonly messagePreview?: string;
  readonly metadata?: NotificationMetadata;
  readonly data?: Record<string, unknown>;

  // Legacy (deprecated)
  readonly title?: string;
  readonly content?: string;
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
 * Options de pagination
 */
export interface NotificationPaginationOptions {
  readonly offset: number;
  readonly limit: number;
  readonly sortBy?: 'createdAt' | 'priority' | 'readAt';
  readonly sortOrder?: 'asc' | 'desc';
}

/**
 * Compteurs de notifications
 */
export interface NotificationCounts {
  readonly total: number;
  readonly unread: number;
  readonly byType: Partial<Record<NotificationType, number>>;
  readonly byPriority: Record<NotificationPriority, number>;
}

/**
 * Statistiques des notifications
 */
export interface NotificationStats {
  readonly totalSent: number;
  readonly totalRead: number;
  readonly totalUnread: number;
  readonly byType: Partial<Record<NotificationType, number>>;
  readonly performance: {
    readonly averageDeliveryTime: number;
    readonly successRate: number;
  };
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
  readonly counts?: NotificationCounts;
}

// =====================================================
// NOTIFICATION PREFERENCE
// =====================================================

/**
 * Préférences de notifications utilisateur
 * Aligned with schema.prisma NotificationPreference + frontend requirements
 */
export interface NotificationPreference {
  readonly id: string;
  readonly userId: string;

  // === GLOBAL SETTINGS ===

  /** Activer les notifications push */
  readonly pushEnabled: boolean;

  /** Activer les notifications email */
  readonly emailEnabled: boolean;

  /** Activer les sons de notification */
  readonly soundEnabled: boolean;

  // === PER-TYPE SETTINGS ===

  /** Notifications de nouveaux messages */
  readonly newMessageEnabled: boolean;

  /** Notifications d'appels manqués */
  readonly missedCallEnabled: boolean;

  /** Notifications système */
  readonly systemEnabled: boolean;

  /** Notifications de nouvelles conversations */
  readonly conversationEnabled: boolean;

  /** Notifications de réponses */
  readonly replyEnabled: boolean;

  /** Notifications de mentions */
  readonly mentionEnabled: boolean;

  /** Notifications de réactions */
  readonly reactionEnabled: boolean;

  /** Notifications de demandes de contact */
  readonly contactRequestEnabled: boolean;

  /** Notifications de nouveaux membres */
  readonly memberJoinedEnabled: boolean;

  // === DO NOT DISTURB ===

  /** Mode "Ne pas déranger" activé */
  readonly dndEnabled: boolean;

  /** Heure de début DND (format: "22:00") */
  readonly dndStartTime?: string;

  /** Heure de fin DND (format: "08:00") */
  readonly dndEndTime?: string;

  // === MUTED CONVERSATIONS ===

  /** Liste des IDs de conversations mutées */
  readonly mutedConversations?: readonly string[];

  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Alias simplifié pour les préférences (frontend-style, sans id/timestamps)
 * Utilisé pour les formulaires de préférences
 */
export interface NotificationPreferences {
  readonly userId: string;

  // Canaux
  readonly pushEnabled: boolean;
  readonly emailEnabled: boolean;
  readonly soundEnabled: boolean;

  // Préférences par type
  readonly newMessageEnabled: boolean;
  readonly replyEnabled: boolean;
  readonly mentionEnabled: boolean;
  readonly reactionEnabled: boolean;
  readonly missedCallEnabled: boolean;
  readonly systemEnabled: boolean;
  readonly conversationEnabled: boolean;
  readonly contactRequestEnabled: boolean;
  readonly memberJoinedEnabled: boolean;

  // Do Not Disturb
  readonly dndEnabled: boolean;
  readonly dndStartTime?: string;
  readonly dndEndTime?: string;

  // Mute par conversation
  readonly mutedConversations: readonly string[];
}

/**
 * DTO pour créer des préférences de notification
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
 * DTO pour mettre à jour des préférences de notification
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
// PUSH NOTIFICATION PAYLOAD
// =====================================================

/**
 * Payload pour notification push (APNs/FCM)
 */
export interface PushNotificationPayload {
  readonly notificationId: string;
  readonly type: NotificationType | string;
  readonly title: string;
  readonly body: string;
  readonly badge?: number;
  readonly sound?: string;
  readonly data?: Record<string, unknown>;
  readonly conversationId?: string;
  readonly messageId?: string;
  readonly senderId?: string;
  readonly senderAvatar?: string;
  readonly priority?: 'low' | 'normal' | 'high';
}

/**
 * Résultat d'envoi de notification push
 */
export interface PushNotificationResult {
  readonly success: boolean;
  readonly notificationId: string;
  readonly deviceToken?: string;
  readonly error?: string;
  readonly errorCode?: string;
}

// =====================================================
// TYPE GUARDS & UTILITIES
// =====================================================

/**
 * Vérifie si une notification est expirée
 */
export function isNotificationExpired(notification: Notification): boolean {
  if (!notification.expiresAt) {
    return false;
  }
  return new Date() > notification.expiresAt;
}

/**
 * Vérifie si une notification est non lue et valide
 */
export function isNotificationUnread(notification: Notification): boolean {
  return !notification.isRead && !isNotificationExpired(notification);
}

/**
 * Vérifie si le mode DND est actif pour un utilisateur
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
 * Vérifie si un type de notification est activé pour un utilisateur
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
      return prefs.mentionEnabled;
    case 'reaction':
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
  // Vérifier si le canal est activé
  if (channel === 'push' && !prefs.pushEnabled) {
    return false;
  }
  if (channel === 'email' && !prefs.emailEnabled) {
    return false;
  }

  // Vérifier si le type est activé
  if (!isNotificationTypeEnabled(prefs, type)) {
    return false;
  }

  // Vérifier le mode DND (sauf pour les alertes de sécurité)
  if (type !== 'security_alert' && isDNDActive(prefs)) {
    return false;
  }

  return true;
}

/**
 * Extrait les informations de l'expéditeur d'une notification
 */
export function getNotificationSender(notification: Notification): NotificationSenderInfo | null {
  if (!notification.senderId) {
    return null;
  }

  return {
    senderId: notification.senderId,
    senderUsername: notification.senderUsername,
    senderAvatar: notification.senderAvatar,
    senderDisplayName: notification.senderDisplayName,
    senderFirstName: notification.senderFirstName,
    senderLastName: notification.senderLastName,
  };
}

/**
 * Crée les préférences par défaut pour un utilisateur
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
