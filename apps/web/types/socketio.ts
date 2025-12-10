/**
 * Types frontend Meeshy - Utilise uniquement les types partagés
 * Ce fichier importe les types de shared/types et ajoute uniquement les types spécifiques au frontend
 */

// ===== IMPORT DES TYPES PARTAGÉS =====
export * from '@meeshy/shared/types';

// Alias pour rétrocompatibilité  
import type { 
  SocketIOMessage, 
  SocketIOUser,
  SocketIOResponse,
  TranslationData,
  ConnectionStatus,
  ConnectionDiagnostics
} from '@meeshy/shared/types/socketio-events';

export type Message = SocketIOMessage;
export type SocketResponse<T = unknown> = SocketIOResponse<T>;

// ===== TYPES SPÉCIFIQUES AU FRONTEND =====

export interface UserPermissions {
  canAccessAdmin: boolean;
  canManageUsers: boolean;
  canManageGroups: boolean;
  canManageConversations: boolean;
  canViewAnalytics: boolean;
  canModerateContent: boolean;
  canViewAuditLogs: boolean;
  canManageNotifications: boolean;
  canManageTranslations: boolean;
}

// Type User étendu avec les permissions pour le frontend
export interface User extends SocketIOUser {
  permissions: UserPermissions;
}

export interface CreateUserDto {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  spokenLanguage: string;
  receiveLanguage: string;
  conversationLinkId: string;
}

// ConversationLink est maintenant importé depuis @shared/types

export interface TranslatedMessage extends Message {
  originalContent?: string;
  translatedContent?: string;
  targetLanguage?: string;
  isTranslated?: boolean;
  isTranslating?: boolean;
  showingOriginal?: boolean;
  translationError?: string;
  translationFailed?: boolean;
  translations?: TranslationData[];
  modelUsed?: string;
  sender?: User; // Utilise le type User avec permissions
}

export interface ChatRoom {
  id: string;
  participantIds: string[];
  messages: Message[];
  createdAt: Date;
}

export interface TranslationModel {
  name: 'MT5' | 'NLLB';
  isLoaded: boolean;
  model?: unknown;
}

export interface LanguageCode {
  code: string;
  name: string;
  flag: string;
}

// ===== TYPES POUR LES PERMISSIONS =====
export interface UserPermissions {
  canAccessAdmin: boolean;
  canManageUsers: boolean;
  canManageGroups: boolean;
  canManageConversations: boolean;
  canViewAnalytics: boolean;
  canModerateContent: boolean;
  canViewAuditLogs: boolean;
  canManageNotifications: boolean;
  canManageTranslations: boolean;
}

// ===== TYPES POUR LES HOOKS =====
export interface UseSocketIOMessagingOptions {
  conversationId?: string;
  currentUser?: User;
  onNewMessage?: (message: Message) => void;
  onMessageEdited?: (message: Message) => void;
  onMessageDeleted?: (messageId: string) => void;
  onUserTyping?: (userId: string, username: string, isTyping: boolean) => void;
  onUserStatus?: (userId: string, username: string, isOnline: boolean) => void;
  onTranslation?: (messageId: string, translations: TranslationData[]) => void;
  onConversationJoined?: (conversationId: string, userId: string) => void;
  onConversationLeft?: (conversationId: string, userId: string) => void;
}

export interface UseSocketIOMessagingReturn {
  // Actions pour les messages
  sendMessage: (content: string) => Promise<boolean>;
  editMessage: (messageId: string, content: string) => Promise<boolean>;
  deleteMessage: (messageId: string) => Promise<boolean>;
  
  // Navigation dans les conversations
  joinConversation: (conversationId: string) => void;
  leaveConversation: (conversationId: string) => void;
  
  // Gestion de la frappe
  startTyping: () => void;
  stopTyping: () => void;
  
  // Gestion de la connexion
  reconnect: () => void;
  getDiagnostics: () => ConnectionDiagnostics;
  
  // État de la connexion
  connectionStatus: ConnectionStatus;
}

// ===== TYPES POUR LES SERVICES =====
export interface ForceTranslationRequest {
  messageId: string;
  targetLanguage: string;
  model?: 'basic' | 'medium' | 'premium';
}

export interface ForceTranslationResponse {
  messageId: string;
  targetLanguage: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  translationId?: string;
  estimatedTime?: number;
}

export interface MessageTranslationStatus {
  messageId: string;
  targetLanguage: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  translatedContent?: string;
  error?: string;
}

// ===== TYPES POUR L'INTERFACE UTILISATEUR =====
export interface UIMessage extends TranslatedMessage {
  // Propriétés spécifiques à l'affichage
  isOptimistic?: boolean; // Pour l'optimistic UI
  tempId?: string; // ID temporaire avant confirmation du serveur
  sendingError?: string; // Erreur lors de l'envoi
  retryCount?: number; // Nombre de tentatives d'envoi
}

export interface ConversationUIState {
  isLoading: boolean;
  hasMoreMessages: boolean;
  typingUsers: string[];
  unreadCount: number;
  lastReadMessageId?: string;
}

// ===== TYPES POUR LES COMPOSANTS =====
export interface MessageComponentProps {
  message: UIMessage;
  isOwn: boolean;
  showSender: boolean;
  showTimestamp: boolean;
  onEdit?: (messageId: string, content: string) => void;
  onDelete?: (messageId: string) => void;
  onTranslate?: (messageId: string, targetLanguage: string) => void;
  onRetry?: (messageId: string) => void;
}

export interface ConversationComponentProps {
  conversation: Conversation;
  messages: UIMessage[];
  currentUser: User;
  uiState: ConversationUIState;
  onSendMessage: (content: string) => Promise<boolean>;
  onEditMessage: (messageId: string, content: string) => Promise<boolean>;
  onDeleteMessage: (messageId: string) => Promise<boolean>;
  onLoadMoreMessages: () => Promise<void>;
}

// ===== TYPES POUR LES CONVERSATIONS =====
export interface Conversation {
  id: string;
  name?: string;
  type: 'private' | 'group';
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  members: ConversationMember[];
  lastMessage?: Message;
}

export interface ConversationMember {
  userId: string;
  conversationId: string;
  role: 'admin' | 'member';
  joinedAt: Date;
  leftAt?: Date;
  user: User;
}
