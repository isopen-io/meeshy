/**
 * Types pour le système de notifications
 *
 * IMPORTANT: Ce fichier ré-exporte les types de @meeshy/shared/types/notification
 * et ajoute uniquement les types spécifiques au frontend (store, composants UI).
 *
 * NE PAS redéfinir les types qui existent dans shared !
 */

// ===== RE-EXPORTS FROM SHARED =====
// Import et ré-export de tous les types de notification depuis shared
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

  // Interfaces principales
  type NotificationSender,
  type NotificationSenderInfo,
  type NotificationContext,
  type NotificationMetadata,
  type Notification,

  // DTOs
  type CreateNotificationDTO,
  type UpdateNotificationDTO,

  // Filtres et pagination
  type NotificationFilters,
  type NotificationPaginationOptions,
  type NotificationCounts,
  type NotificationStats,
  type NotificationResponse,

  // Préférences
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
} from '@meeshy/shared/types/notification';

// ===== FRONTEND-SPECIFIC TYPES =====

// Re-import for local use
import type {
  Notification,
  NotificationFilters,
  NotificationCounts,
  NotificationType,
} from '@meeshy/shared/types/notification';

/**
 * Événement Socket.IO pour les notifications
 */
export interface NotificationSocketEvent {
  event: 'notification' | 'notification:read' | 'notification:deleted' | 'notification:counts';
  data: Notification | { notificationId: string } | NotificationCounts;
}

/**
 * Configuration du store
 */
export interface NotificationStoreConfig {
  maxNotifications?: number;
  pollingInterval?: number;
  enableSound?: boolean;
  enableToast?: boolean;
}

/**
 * État du store de notifications
 */
export interface NotificationStoreState {
  // État des données
  notifications: Notification[];
  unreadCount: number;
  counts: NotificationCounts;

  // État de l'UI
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;

  // Pagination
  page: number;
  hasMore: boolean;

  // Filtres
  filters: NotificationFilters;

  // Connexion
  isConnected: boolean;
  lastSync?: Date;

  // Conversation active (pour filtrer les notifications)
  activeConversationId: string | null;
}

/**
 * Actions du store de notifications
 */
export interface NotificationStoreActions {
  // Initialisation
  initialize: () => Promise<void>;
  disconnect: () => void;

  // Chargement
  fetchNotifications: (options?: { offset?: number; limit?: number }) => Promise<void>;
  fetchMore: () => Promise<void>;
  refresh: () => Promise<void>;

  // Actions sur les notifications
  addNotification: (notification: Notification) => void;
  removeNotification: (id: string) => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  deleteAllRead: () => Promise<void>;

  // Filtres
  setFilters: (filters: Partial<NotificationFilters>) => void;
  clearFilters: () => void;

  // Compteurs
  updateCounts: (counts: NotificationCounts) => void;
  updateCountsFromNotifications: () => void;

  // État
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setConnected: (isConnected: boolean) => void;
  setActiveConversationId: (conversationId: string | null) => void;
}

/**
 * Type complet du store
 */
export type NotificationStore = NotificationStoreState & NotificationStoreActions;

/**
 * Props pour les composants de notification
 */
export interface NotificationItemProps {
  notification: Notification;
  onRead?: (id: string) => void;
  onDelete?: (id: string) => void;
  onClick?: (notification: Notification) => void;
  showActions?: boolean;
  compact?: boolean;
}

export interface NotificationListProps {
  notifications: Notification[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoading?: boolean;
  emptyMessage?: string;
  onNotificationClick?: (notification: Notification) => void;
  /** Render in compact mode */
  compact?: boolean;
}

export interface NotificationBellProps {
  count?: number;
  onClick?: () => void;
  showBadge?: boolean;
  animated?: boolean;
  className?: string;
}

/**
 * Helper type pour les icônes de notification
 */
export interface NotificationIcon {
  emoji: string;
  color: string;
  bgColor: string;
}

/**
 * Helper type pour les actions rapides
 */
export interface NotificationQuickAction {
  label: string;
  onClick: () => void | Promise<void>;
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: string;
}

/**
 * Réponse paginée pour le frontend (alias pour compatibilité)
 */
export interface NotificationPaginatedResponse {
  notifications: Notification[];
  pagination: {
    offset: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
  unreadCount?: number;
}

// ===== LEGACY ALIASES FOR BACKWARDS COMPATIBILITY =====
// These are aliases for the enum values to support both usage patterns
// NOTE: Renamed to avoid conflict with the type export from shared

/** @deprecated Use NotificationTypeEnum instead */
export const NotificationTypeValues = {
  // MESSAGE EVENTS
  NEW_MESSAGE: 'new_message' as NotificationType,
  MESSAGE_REPLY: 'message_reply' as NotificationType,
  MESSAGE_EDITED: 'message_edited' as NotificationType,
  MESSAGE_DELETED: 'message_deleted' as NotificationType,
  MESSAGE_PINNED: 'message_pinned' as NotificationType,
  MESSAGE_UNPINNED: 'message_unpinned' as NotificationType,
  MESSAGE_FORWARDED: 'message_forwarded' as NotificationType,

  // CONVERSATION EVENTS
  NEW_CONVERSATION: 'new_conversation' as NotificationType,
  NEW_CONVERSATION_DIRECT: 'new_conversation_direct' as NotificationType,
  NEW_CONVERSATION_GROUP: 'new_conversation_group' as NotificationType,
  CONVERSATION_ARCHIVED: 'conversation_archived' as NotificationType,
  CONVERSATION_UNARCHIVED: 'conversation_unarchived' as NotificationType,
  CONVERSATION_DELETED: 'conversation_deleted' as NotificationType,
  CONVERSATION_SETTINGS_CHANGED: 'conversation_settings_changed' as NotificationType,
  ADDED_TO_CONVERSATION: 'added_to_conversation' as NotificationType,
  REMOVED_FROM_CONVERSATION: 'removed_from_conversation' as NotificationType,
  CONVERSATION_ENCRYPTION_ENABLED: 'conversation_encryption_enabled' as NotificationType,

  // MEMBER/GROUP EVENTS
  MEMBER_JOINED: 'member_joined' as NotificationType,
  MEMBER_LEFT: 'member_left' as NotificationType,
  MEMBER_REMOVED: 'member_removed' as NotificationType,
  MEMBER_PROMOTED: 'member_promoted' as NotificationType,
  MEMBER_DEMOTED: 'member_demoted' as NotificationType,
  MEMBER_ROLE_CHANGED: 'member_role_changed' as NotificationType,

  // CONTACT/FRIEND EVENTS
  CONTACT_REQUEST: 'contact_request' as NotificationType,
  CONTACT_ACCEPTED: 'contact_accepted' as NotificationType,
  CONTACT_REJECTED: 'contact_rejected' as NotificationType,
  CONTACT_BLOCKED: 'contact_blocked' as NotificationType,
  CONTACT_UNBLOCKED: 'contact_unblocked' as NotificationType,
  FRIEND_REQUEST: 'friend_request' as NotificationType,
  FRIEND_ACCEPTED: 'friend_accepted' as NotificationType,

  // INTERACTION EVENTS
  USER_MENTIONED: 'user_mentioned' as NotificationType,
  MENTION: 'mention' as NotificationType,
  MESSAGE_REACTION: 'message_reaction' as NotificationType,
  REACTION: 'reaction' as NotificationType,

  // CALL EVENTS
  MISSED_CALL: 'missed_call' as NotificationType,
  INCOMING_CALL: 'incoming_call' as NotificationType,
  CALL_ENDED: 'call_ended' as NotificationType,
  CALL_DECLINED: 'call_declined' as NotificationType,
  CALL_RECORDING_READY: 'call_recording_ready' as NotificationType,

  // TRANSLATION/AUDIO EVENTS
  TRANSLATION_COMPLETED: 'translation_completed' as NotificationType,
  TRANSLATION_FAILED: 'translation_failed' as NotificationType,
  TRANSCRIPTION_COMPLETED: 'transcription_completed' as NotificationType,
  TRANSCRIPTION_FAILED: 'transcription_failed' as NotificationType,
  VOICE_CLONE_READY: 'voice_clone_ready' as NotificationType,
  VOICE_CLONE_FAILED: 'voice_clone_failed' as NotificationType,
  AUDIO_MESSAGE_TRANSLATED: 'audio_message_translated' as NotificationType,

  // SECURITY/ACCOUNT EVENTS
  LOGIN_NEW_DEVICE: 'login_new_device' as NotificationType,
  LOGIN_SUSPICIOUS: 'login_suspicious' as NotificationType,
  PASSWORD_CHANGED: 'password_changed' as NotificationType,
  PASSWORD_RESET_REQUESTED: 'password_reset_requested' as NotificationType,
  EMAIL_VERIFIED: 'email_verified' as NotificationType,
  PHONE_VERIFIED: 'phone_verified' as NotificationType,
  TWO_FACTOR_ENABLED: 'two_factor_enabled' as NotificationType,
  TWO_FACTOR_DISABLED: 'two_factor_disabled' as NotificationType,
  SESSION_EXPIRED: 'session_expired' as NotificationType,
  ACCOUNT_LOCKED: 'account_locked' as NotificationType,
  ACCOUNT_UNLOCKED: 'account_unlocked' as NotificationType,

  // MODERATION EVENTS
  CONTENT_FLAGGED: 'content_flagged' as NotificationType,
  CONTENT_REMOVED: 'content_removed' as NotificationType,
  REPORT_SUBMITTED: 'report_submitted' as NotificationType,
  REPORT_RESOLVED: 'report_resolved' as NotificationType,
  WARNING_RECEIVED: 'warning_received' as NotificationType,

  // FILE/ATTACHMENT EVENTS
  FILE_SHARED: 'file_shared' as NotificationType,
  FILE_UPLOAD_COMPLETED: 'file_upload_completed' as NotificationType,
  FILE_UPLOAD_FAILED: 'file_upload_failed' as NotificationType,
  FILE_SCAN_COMPLETED: 'file_scan_completed' as NotificationType,

  // COMMUNITY EVENTS
  COMMUNITY_INVITE: 'community_invite' as NotificationType,
  COMMUNITY_JOINED: 'community_joined' as NotificationType,
  COMMUNITY_LEFT: 'community_left' as NotificationType,
  COMMUNITY_ANNOUNCEMENT: 'community_announcement' as NotificationType,
  COMMUNITY_ROLE_CHANGED: 'community_role_changed' as NotificationType,

  // SYSTEM EVENTS
  SYSTEM: 'system' as NotificationType,
  MAINTENANCE: 'maintenance' as NotificationType,
  UPDATE_AVAILABLE: 'update_available' as NotificationType,
  FEATURE_ANNOUNCEMENT: 'feature_announcement' as NotificationType,
  TERMS_UPDATED: 'terms_updated' as NotificationType,
  PRIVACY_UPDATED: 'privacy_updated' as NotificationType,

  // ENGAGEMENT/GAMIFICATION
  ACHIEVEMENT_UNLOCKED: 'achievement_unlocked' as NotificationType,
  STREAK_MILESTONE: 'streak_milestone' as NotificationType,
  LEVEL_UP: 'level_up' as NotificationType,
  BADGE_EARNED: 'badge_earned' as NotificationType,

  // PAYMENT/SUBSCRIPTION
  SUBSCRIPTION_EXPIRING: 'subscription_expiring' as NotificationType,
  SUBSCRIPTION_RENEWED: 'subscription_renewed' as NotificationType,
  PAYMENT_RECEIVED: 'payment_received' as NotificationType,
  PAYMENT_FAILED: 'payment_failed' as NotificationType,
} as const;

/** @deprecated Use NotificationPriorityEnum instead */
export const NotificationPriorityValues = {
  LOW: 'low' as const,
  NORMAL: 'normal' as const,
  HIGH: 'high' as const,
  URGENT: 'urgent' as const,
} as const;
