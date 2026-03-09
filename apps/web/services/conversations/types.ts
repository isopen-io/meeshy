/**
 * Types spécifiques au service conversations
 * Séparé des types globaux pour une meilleure organisation
 */

import type {
  Conversation,
  Message,
  PaginationMeta,
  CursorPaginationMeta,
  ConversationType,
  TranslationModel,
  Attachment,
  MessageSource,
  MessageType,
} from '@meeshy/shared/types';

/**
 * Options de filtrage pour les participants
 */
export interface ParticipantsFilters {
  onlineOnly?: boolean;
  role?: string;
  search?: string;
  limit?: number;
  cursor?: string;
}

/**
 * Options pour récupérer les conversations
 */
export interface GetConversationsOptions {
  limit?: number;
  offset?: number;
  skipCache?: boolean;
  type?: ConversationType;
  withUserId?: string;
  before?: string;
}

/**
 * Réponse de récupération de conversations avec pagination
 */
export interface GetConversationsResponse {
  conversations: Conversation[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  cursorPagination?: CursorPaginationMeta;
}

/**
 * Réponse de récupération de messages avec pagination
 */
export interface GetMessagesResponse {
  messages: Message[];
  total: number;
  hasMore: boolean;
  pagination?: PaginationMeta;
  cursorPagination?: CursorPaginationMeta;
}

/**
 * Participant response matching backend GET /conversations/:id/participants
 * Unified shape for both authenticated and anonymous participants
 */
export interface ConversationParticipantResponse {
  id: string;
  participantId: string;
  userId: string | null;
  type: string;
  username: string;
  firstName: string;
  lastName: string;
  displayName: string;
  avatar: string | null;
  email: string;
  role: string;
  conversationRole: string;
  joinedAt: string;
  isOnline: boolean;
  lastActiveAt: string | null;
  isActive: boolean;
  isAnonymous: boolean;
  systemLanguage: string;
  regionalLanguage: string;
  customDestinationLanguage: string;
  autoTranslateEnabled: boolean;
  canSendMessages: boolean;
  canSendFiles: boolean;
  canSendImages: boolean;
  createdAt: string;
  updatedAt: string;
  permissions: {
    canAccessAdmin: boolean;
    canManageUsers: boolean;
    canManageGroups: boolean;
    canManageConversations: boolean;
    canViewAnalytics: boolean;
    canModerateContent: boolean;
    canViewAuditLogs: boolean;
    canManageNotifications: boolean;
    canManageTranslations: boolean;
  };
}

/**
 * Tous les participants (authentifiés et anonymes)
 */
export interface AllParticipantsResponse {
  authenticatedParticipants: ConversationParticipantResponse[];
  anonymousParticipants: ConversationParticipantResponse[];
  totalCount?: number;
}

/**
 * Données pour créer un lien d'invitation
 */
export interface CreateLinkData {
  name?: string;
  description?: string;
  maxUses?: number;
  expiresAt?: string;
  allowAnonymousMessages?: boolean;
  allowAnonymousFiles?: boolean;
  allowAnonymousImages?: boolean;
  allowViewHistory?: boolean;
  requireNickname?: boolean;
  requireEmail?: boolean;
}

/**
 * Réponse de marquage comme lu
 */
export interface MarkAsReadResponse {
  success: boolean;
  message: string;
  markedCount: number;
}

/**
 * Cache de conversations
 */
export interface ConversationsCache {
  data: Conversation[];
  timestamp: number;
}

/**
 * Cache de messages
 */
export interface MessagesCache {
  data: Message[];
  timestamp: number;
  hasMore: boolean;
}

/**
 * Cache de participants
 */
export interface ParticipantsCache {
  data: ConversationParticipantResponse[];
  timestamp: number;
}

/**
 * Données brutes du backend pour conversion
 */
export interface BackendMessageData {
  id: unknown;
  content: unknown;
  senderId?: unknown;
  conversationId: unknown;
  originalLanguage?: unknown;
  messageType?: unknown;
  messageSource?: unknown;
  isEdited?: unknown;
  deletedAt?: unknown;
  isViewOnce?: unknown;
  viewOnceCount?: unknown;
  isBlurred?: unknown;
  deliveredCount?: unknown;
  readCount?: unknown;
  reactionCount?: unknown;
  reactionSummary?: unknown;
  isEncrypted?: unknown;
  encryptedContent?: unknown;
  encryptionMode?: unknown;
  encryptionMetadata?: unknown;
  createdAt: unknown;
  updatedAt: unknown;
  sender?: unknown;
  translations?: unknown[];
  replyTo?: unknown;
  attachments?: unknown[];
}

/**
 * Données brutes du backend pour une conversation
 */
export interface BackendConversationData {
  id: unknown;
  type?: unknown;
  title?: unknown;
  description?: unknown;
  image?: unknown;
  avatar?: unknown;
  communityId?: unknown;
  isActive?: unknown;
  isArchived?: unknown;
  isGroup?: unknown;
  isPrivate?: unknown;
  lastMessageAt?: unknown;
  createdAt: unknown;
  updatedAt: unknown;
  participants?: unknown[];
  lastMessage?: unknown;
  unreadCount?: unknown;
}
