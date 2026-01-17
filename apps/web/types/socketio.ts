/**
 * Types Socket.IO frontend Meeshy
 *
 * IMPORTANT: Ce fichier ne doit contenir QUE des types spécifiques au frontend Socket.IO.
 * Tous les types partagés sont importés de @meeshy/shared/types
 */

// ===== IMPORT ET RE-EXPORT DES TYPES PARTAGÉS =====
export * from '@meeshy/shared/types';

// Import des types nécessaires pour les extensions frontend
import type {
  SocketIOMessage,
  SocketIOUser,
  SocketIOResponse,
  TranslationData,
  ConnectionStatus,
  ConnectionDiagnostics,
  UserPermissions as SharedUserPermissions,
  UIMessage as SharedUIMessage,
  GatewayMessage,
  MessageWithTranslations as SharedMessageWithTranslations,
  TranslationModel,
} from '@meeshy/shared/types';

// Alias pour rétrocompatibilité
export type Message = SocketIOMessage;
export type SocketResponse<T = unknown> = SocketIOResponse<T>;

// ===== TYPES SPÉCIFIQUES AU FRONTEND SOCKET.IO =====

/**
 * User étendu avec permissions pour le frontend
 */
export interface FrontendUser extends SocketIOUser {
  permissions: SharedUserPermissions;
}

// Alias pour rétrocompatibilité
export type User = FrontendUser;

/**
 * Message avec traductions pour l'affichage frontend
 * @deprecated Utilisez SharedUIMessage de @meeshy/shared/types à la place
 */
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
  sender?: FrontendUser;
}

// ===== TYPES POUR LES HOOKS SOCKET.IO =====

export interface UseSocketIOMessagingOptions {
  conversationId?: string;
  currentUser?: FrontendUser;
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

// ===== TYPES POUR LES SERVICES DE TRADUCTION =====

export interface ForceTranslationRequest {
  messageId: string;
  targetLanguage: string;
  model?: TranslationModel;
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

/**
 * UIMessage frontend - utilise le type partagé + extensions frontend
 * Combine SharedUIMessage de shared avec les champs spécifiques au frontend
 */
export interface UIMessage extends TranslatedMessage {
  // === FROM SHARED UIMessage ===
  // uiTranslations, translatingLanguages, currentDisplayLanguage, showingOriginal
  // originalContent, canEdit, canDelete, canTranslate, canReply sont dans SharedUIMessage

  // === FRONTEND-SPECIFIC FIELDS ===
  /** Message optimiste (pas encore confirmé par le serveur) */
  isOptimistic?: boolean;

  /** ID temporaire avant confirmation serveur */
  tempId?: string;

  /** Erreur d'envoi du message */
  sendingError?: string;

  /** Nombre de tentatives d'envoi */
  retryCount?: number;
}

/**
 * Alias pour utiliser le type UIMessage de shared directement
 * @see SharedUIMessage pour le type principal
 */
export type UIMessageFromShared = SharedUIMessage & {
  isOptimistic?: boolean;
  tempId?: string;
  sendingError?: string;
  retryCount?: number;
};

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

// Note: Conversation et ConversationMember sont importés depuis @meeshy/shared/types
// via l'export * ci-dessus
