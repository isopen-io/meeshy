/**
 * Types spécifiques au service conversations
 * Séparé des types globaux pour une meilleure organisation
 */

import type {
  Conversation,
  Message,
  User,
  PaginationMeta,
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
}

/**
 * Réponse de récupération de messages avec pagination
 */
export interface GetMessagesResponse {
  messages: Message[];
  total: number;
  hasMore: boolean;
  pagination?: PaginationMeta;
}

/**
 * Tous les participants (authentifiés et anonymes)
 */
export interface AllParticipantsResponse {
  authenticatedParticipants: User[];
  anonymousParticipants: Array<{
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    language: string;
    isOnline: boolean;
    joinedAt: string;
    canSendMessages: boolean;
    canSendFiles: boolean;
    canSendImages: boolean;
  }>;
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
  data: User[];
  timestamp: number;
}

/**
 * Données brutes du backend pour conversion
 */
export interface BackendMessageData {
  id: unknown;
  content: unknown;
  senderId?: unknown;
  anonymousSenderId?: unknown;
  conversationId: unknown;
  originalLanguage?: unknown;
  messageType?: unknown;
  messageSource?: unknown;
  isEdited?: unknown;
  isDeleted?: unknown;
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
  anonymousSender?: unknown;
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
  members?: unknown[];
  lastMessage?: unknown;
  unreadCount?: unknown;
}
