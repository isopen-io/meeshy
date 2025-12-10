/**
 * Types pour le système de notifications v2
 * Basé sur NOTIFICATION_SYSTEM_ARCHITECTURE.md
 */

/**
 * Types de notifications supportés
 */
export enum NotificationType {
  NEW_MESSAGE = 'new_message',
  NEW_CONVERSATION_DIRECT = 'new_conversation_direct',
  NEW_CONVERSATION_GROUP = 'new_conversation_group',
  MESSAGE_REPLY = 'message_reply',
  MEMBER_JOINED = 'member_joined',
  CONTACT_REQUEST = 'contact_request',
  CONTACT_ACCEPTED = 'contact_accepted',
  USER_MENTIONED = 'user_mentioned',
  MESSAGE_REACTION = 'message_reaction',
  MISSED_CALL = 'missed_call',
  SYSTEM = 'system'
}

/**
 * Priorités des notifications
 */
export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent'
}

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
 * Types de conversations
 */
export type ConversationType = 'direct' | 'group' | 'public' | 'global';

/**
 * Types d'attachments
 */
export type AttachmentType = 'image' | 'video' | 'audio' | 'document' | 'pdf';

/**
 * Informations sur l'expéditeur
 * Ordre de priorité pour l'affichage:
 * 1. displayName (si existe)
 * 2. firstName + lastName
 * 3. username (fallback)
 */
export interface NotificationSender {
  id: string;
  username: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
}

/**
 * Contexte de navigation pour les notifications
 */
export interface NotificationContext {
  conversationId?: string;
  conversationTitle?: string;
  conversationType?: ConversationType;
  messageId?: string;
  originalMessageId?: string;
  callSessionId?: string;
  friendRequestId?: string;
  reactionId?: string;
}

/**
 * Métadonnées enrichies pour l'UI
 */
export interface NotificationMetadata {
  attachments?: {
    count: number;
    firstType: AttachmentType;
    firstFilename: string;
  };
  reactionEmoji?: string;
  memberCount?: number;
  action?: NotificationAction;
  joinMethod?: 'via_link' | 'invited';
  systemType?: 'maintenance' | 'security' | 'announcement' | 'feature';
  isMember?: boolean;
}

/**
 * Structure complète d'une notification v2
 *
 * IMPORTANT: Le backend ne doit PAS construire le `title`.
 * Le frontend construit le titre via `buildNotificationTitle(notification)`
 * à partir du `type` et des données brutes (`sender`, `context`, `metadata`).
 */
export interface NotificationV2 {
  id: string;
  userId: string;
  type: NotificationType; // ← Le frontend utilise ce type pour construire le titre
  priority: NotificationPriority;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
  expiresAt?: Date;

  // Informations de l'expéditeur (utilisées pour construire le titre)
  sender?: NotificationSender;

  // Aperçu du message
  messagePreview?: string;

  // Contexte de navigation (utilisé pour construire le titre)
  context?: NotificationContext;

  // Métadonnées enrichies (utilisées pour construire le titre)
  metadata?: NotificationMetadata;

  // Données brutes pour compatibilité
  data?: Record<string, unknown>;

  // ⚠️ DEPRECATED: Ne plus utiliser côté backend
  // Le frontend construit le titre à partir du type + données brutes
  title?: string; // Fallback seulement si le frontend ne peut pas construire le titre
  content?: string; // Fallback ou contenu additionnel
}

/**
 * Filtres pour les notifications
 */
export interface NotificationFilters {
  type?: NotificationType | 'all';
  isRead?: boolean;
  priority?: NotificationPriority;
  conversationId?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Options de pagination
 */
export interface NotificationPaginationOptions {
  page: number;
  limit: number;
  sortBy?: 'createdAt' | 'priority' | 'readAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Réponse paginée
 */
export interface NotificationPaginatedResponse {
  notifications: NotificationV2[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * Compteurs de notifications
 */
export interface NotificationCounts {
  total: number;
  unread: number;
  byType: Record<NotificationType, number>;
  byPriority: Record<NotificationPriority, number>;
}

/**
 * Statistiques des notifications
 */
export interface NotificationStats {
  totalSent: number;
  totalRead: number;
  totalUnread: number;
  byType: Record<NotificationType, number>;
  performance: {
    averageDeliveryTime: number;
    successRate: number;
  };
}

/**
 * Préférences de notifications par type
 */
export interface NotificationPreferences {
  userId: string;

  // Canaux
  pushEnabled: boolean;
  emailEnabled: boolean;
  soundEnabled: boolean;

  // Préférences par type
  newMessageEnabled: boolean;
  replyEnabled: boolean;
  mentionEnabled: boolean;
  reactionEnabled: boolean;
  missedCallEnabled: boolean;
  systemEnabled: boolean;
  conversationEnabled: boolean;
  contactRequestEnabled: boolean;
  memberJoinedEnabled: boolean;

  // Do Not Disturb
  dndEnabled: boolean;
  dndStartTime?: string; // Format: "22:00"
  dndEndTime?: string;   // Format: "08:00"

  // Mute par conversation
  mutedConversations: string[];
}

/**
 * Événement Socket.IO pour les notifications
 */
export interface NotificationSocketEvent {
  event: 'notification' | 'notification:read' | 'notification:deleted' | 'notification:counts';
  data: NotificationV2 | { notificationId: string } | NotificationCounts;
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
  notifications: NotificationV2[];
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
  fetchNotifications: (options?: NotificationPaginationOptions) => Promise<void>;
  fetchMore: () => Promise<void>;
  refresh: () => Promise<void>;

  // Actions sur les notifications
  addNotification: (notification: NotificationV2) => void;
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
  notification: NotificationV2;
  onRead?: (id: string) => void;
  onDelete?: (id: string) => void;
  onClick?: (notification: NotificationV2) => void;
  showActions?: boolean;
  compact?: boolean;
}

export interface NotificationListProps {
  notifications: NotificationV2[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoading?: boolean;
  emptyMessage?: string;
  onNotificationClick?: (notification: NotificationV2) => void;
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
