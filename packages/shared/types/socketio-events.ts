/**
 * Types unifiés pour les événements Socket.IO Meeshy
 * Remplace les anciens types WebSocket pour correspondre à la nouvelle architecture Socket.IO
 */

// Import pour AnonymousParticipant
import type { AnonymousParticipant } from './anonymous';

// Import pour les événements d'appels vidéo
import type {
  CallInitiateEvent,
  CallInitiatedEvent,
  CallJoinEvent,
  CallSignalEvent,
  CallParticipantJoinedEvent,
  CallParticipantLeftEvent,
  CallEndedEvent,
  CallMediaToggleEvent,
  CallError
} from './video-call';

// ===== CONSTANTES D'ÉVÉNEMENTS =====

// Événements du serveur vers le client
export const SERVER_EVENTS = {
  MESSAGE_NEW: 'message:new',
  MESSAGE_EDITED: 'message:edited',
  MESSAGE_DELETED: 'message:deleted',
  MESSAGE_TRANSLATION: 'message:translation',
  MESSAGE_TRANSLATED: 'message_translated',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  USER_STATUS: 'user:status',
  CONVERSATION_JOINED: 'conversation:joined',
  CONVERSATION_LEFT: 'conversation:left',
  AUTHENTICATED: 'authenticated',
  MESSAGE_SENT: 'message_sent',
  ERROR: 'error',
  TRANSLATION_RECEIVED: 'translation_received',
  TRANSLATION_ERROR: 'translation_error',
  NOTIFICATION: 'notification',
  SYSTEM_MESSAGE: 'system_message',
  CONVERSATION_STATS: 'conversation:stats',
  CONVERSATION_ONLINE_STATS: 'conversation:online_stats',
  CONVERSATION_UNREAD_UPDATED: 'conversation:unread-updated',
  REACTION_ADDED: 'reaction:added',
  REACTION_REMOVED: 'reaction:removed',
  REACTION_SYNC: 'reaction:sync',
  MENTION_CREATED: 'mention:created',
  CALL_INITIATED: 'call:initiated',
  CALL_PARTICIPANT_JOINED: 'call:participant-joined',
  CALL_PARTICIPANT_LEFT: 'call:participant-left',
  CALL_ENDED: 'call:ended',
  CALL_SIGNAL: 'call:signal',
  CALL_MEDIA_TOGGLED: 'call:media-toggled',
  CALL_ERROR: 'call:error'
} as const;

// Événements du client vers le serveur
export const CLIENT_EVENTS = {
  MESSAGE_SEND: 'message:send',
  MESSAGE_SEND_WITH_ATTACHMENTS: 'message:send-with-attachments',
  MESSAGE_EDIT: 'message:edit',
  MESSAGE_DELETE: 'message:delete',
  CONVERSATION_JOIN: 'conversation:join',
  CONVERSATION_LEAVE: 'conversation:leave',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  USER_STATUS: 'user:status',
  AUTHENTICATE: 'authenticate',
  REQUEST_TRANSLATION: 'request_translation',
  REACTION_ADD: 'reaction:add',
  REACTION_REMOVE: 'reaction:remove',
  REACTION_REQUEST_SYNC: 'reaction:request_sync',
  CALL_INITIATE: 'call:initiate',
  CALL_JOIN: 'call:join',
  CALL_LEAVE: 'call:leave',
  CALL_SIGNAL: 'call:signal',
  CALL_TOGGLE_AUDIO: 'call:toggle-audio',
  CALL_TOGGLE_VIDEO: 'call:toggle-video',
  CALL_END: 'call:end'
} as const;

// ===== ÉVÉNEMENTS SOCKET.IO =====

// Types utilitaires pour les constantes
export type ServerEventNames = typeof SERVER_EVENTS[keyof typeof SERVER_EVENTS];
export type ClientEventNames = typeof CLIENT_EVENTS[keyof typeof CLIENT_EVENTS];

/**
 * Données pour l'événement de suppression de message
 */
export interface MessageDeletedEventData {
  readonly messageId: string;
  readonly conversationId: string;
}

/**
 * Données pour l'événement de participation à une conversation
 */
export interface ConversationParticipationEventData {
  readonly conversationId: string;
  readonly userId: string;
}

/**
 * Données pour l'événement d'authentification
 */
export interface AuthenticatedEventData {
  readonly success: boolean;
  readonly user?: SocketIOUser;
  readonly error?: string;
}

/**
 * Données pour l'événement d'envoi de message
 */
export interface MessageSentEventData {
  readonly messageId: string;
  readonly status: string;
  readonly timestamp: string;
}

/**
 * Données pour l'événement d'erreur
 */
export interface ErrorEventData {
  readonly message: string;
  readonly code?: string;
}

/**
 * Données pour l'événement de réception de traduction
 */
export interface TranslationReceivedEventData {
  readonly messageId: string;
  readonly translatedText: string;
  readonly targetLanguage: string;
  readonly confidenceScore?: number;
}

/**
 * Données pour l'événement d'erreur de traduction
 */
export interface TranslationErrorEventData {
  readonly messageId: string;
  readonly targetLanguage: string;
  readonly error: string;
}

/**
 * Données de notification générique
 */
export interface NotificationEventData {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly message: string;
  readonly timestamp: Date;
}

/**
 * Données de message système
 */
export interface SystemMessageEventData {
  readonly type: string;
  readonly content: string;
  readonly timestamp: Date;
}

/**
 * Données pour l'événement de statistiques de conversation
 */
export interface ConversationStatsEventData {
  readonly conversationId: string;
  readonly stats: ConversationStatsDTO;
}

/**
 * Données pour l'événement de statistiques en ligne
 */
export interface ConversationOnlineStatsEventData {
  readonly conversationId: string;
  readonly onlineUsers: readonly ConversationOnlineUser[];
  readonly updatedAt: Date;
}

/**
 * Données pour l'événement de mise à jour du compteur de messages non lus
 */
export interface ConversationUnreadUpdatedEventData {
  readonly conversationId: string;
  readonly unreadCount: number;
}

/**
 * Données pour l'événement de mise à jour de réaction
 */
export interface ReactionUpdateEventData {
  readonly messageId: string;
  readonly userId?: string;
  readonly anonymousId?: string;
  readonly emoji: string;
  readonly action: 'add' | 'remove';
  readonly aggregation: {
    readonly emoji: string;
    readonly count: number;
    readonly userIds: readonly string[];
    readonly anonymousIds: readonly string[];
    readonly hasCurrentUser: boolean;
  };
  readonly timestamp: Date;
}

/**
 * Données pour l'événement de synchronisation des réactions
 */
export interface ReactionSyncEventData {
  readonly messageId: string;
  readonly reactions: readonly {
    readonly emoji: string;
    readonly count: number;
    readonly userIds: readonly string[];
    readonly anonymousIds: readonly string[];
    readonly hasCurrentUser: boolean;
  }[];
  readonly totalCount: number;
  readonly userReactions: readonly string[];
}

// Événements du serveur vers le client
export interface ServerToClientEvents {
  [SERVER_EVENTS.MESSAGE_NEW]: (message: SocketIOMessage) => void;
  [SERVER_EVENTS.MESSAGE_EDITED]: (message: SocketIOMessage) => void;
  [SERVER_EVENTS.MESSAGE_DELETED]: (data: MessageDeletedEventData) => void;
  [SERVER_EVENTS.MESSAGE_TRANSLATION]: (data: TranslationEvent) => void;
  [SERVER_EVENTS.MESSAGE_TRANSLATED]: (data: TranslationEvent) => void;
  [SERVER_EVENTS.TYPING_START]: (data: TypingEvent) => void;
  [SERVER_EVENTS.TYPING_STOP]: (data: TypingEvent) => void;
  [SERVER_EVENTS.USER_STATUS]: (data: UserStatusEvent) => void;
  [SERVER_EVENTS.CONVERSATION_JOINED]: (data: ConversationParticipationEventData) => void;
  [SERVER_EVENTS.CONVERSATION_LEFT]: (data: ConversationParticipationEventData) => void;
  [SERVER_EVENTS.AUTHENTICATED]: (data: AuthenticatedEventData) => void;
  [SERVER_EVENTS.MESSAGE_SENT]: (data: MessageSentEventData) => void;
  [SERVER_EVENTS.ERROR]: (data: ErrorEventData) => void;
  [SERVER_EVENTS.TRANSLATION_RECEIVED]: (data: TranslationReceivedEventData) => void;
  [SERVER_EVENTS.TRANSLATION_ERROR]: (data: TranslationErrorEventData) => void;
  [SERVER_EVENTS.NOTIFICATION]: (data: NotificationEventData) => void;
  [SERVER_EVENTS.SYSTEM_MESSAGE]: (data: SystemMessageEventData) => void;
  [SERVER_EVENTS.CONVERSATION_STATS]: (data: ConversationStatsEventData) => void;
  [SERVER_EVENTS.CONVERSATION_ONLINE_STATS]: (data: ConversationOnlineStatsEventData) => void;
  [SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED]: (data: ConversationUnreadUpdatedEventData) => void;
  [SERVER_EVENTS.REACTION_ADDED]: (data: ReactionUpdateEventData) => void;
  [SERVER_EVENTS.REACTION_REMOVED]: (data: ReactionUpdateEventData) => void;
  [SERVER_EVENTS.REACTION_SYNC]: (data: ReactionSyncEventData) => void;
  [SERVER_EVENTS.CALL_INITIATED]: (data: CallInitiatedEvent) => void;
  [SERVER_EVENTS.CALL_PARTICIPANT_JOINED]: (data: CallParticipantJoinedEvent) => void;
  [SERVER_EVENTS.CALL_PARTICIPANT_LEFT]: (data: CallParticipantLeftEvent) => void;
  [SERVER_EVENTS.CALL_ENDED]: (data: CallEndedEvent) => void;
  [SERVER_EVENTS.CALL_SIGNAL]: (data: CallSignalEvent) => void;
  [SERVER_EVENTS.CALL_MEDIA_TOGGLED]: (data: CallMediaToggleEvent) => void;
  [SERVER_EVENTS.CALL_ERROR]: (data: CallError) => void;
}

/**
 * Données pour l'envoi de message
 */
export interface MessageSendData {
  readonly conversationId: string;
  readonly content: string;
  readonly originalLanguage?: string;
  readonly messageType?: string;
  readonly replyToId?: string;
}

/**
 * Réponse d'envoi de message
 */
export interface MessageSendResponseData {
  readonly messageId: string;
}

/**
 * Données pour l'envoi de message avec attachements
 */
export interface MessageSendWithAttachmentsData {
  readonly conversationId: string;
  readonly content: string;
  readonly originalLanguage?: string;
  readonly attachmentIds: readonly string[];
  readonly replyToId?: string;
}

/**
 * Données pour l'édition de message
 */
export interface MessageEditData {
  readonly messageId: string;
  readonly content: string;
}

/**
 * Données pour la suppression de message
 */
export interface MessageDeleteData {
  readonly messageId: string;
}

/**
 * Données pour rejoindre/quitter une conversation
 */
export interface ConversationActionData {
  readonly conversationId: string;
}

/**
 * Données pour les événements de frappe
 */
export interface TypingActionData {
  readonly conversationId: string;
}

/**
 * Données pour le statut utilisateur
 */
export interface UserStatusData {
  readonly isOnline: boolean;
}

/**
 * Données pour l'authentification
 */
export interface AuthenticateData {
  readonly userId?: string;
  readonly sessionToken?: string;
  readonly language?: string;
}

/**
 * Données pour la requête de traduction
 */
export interface RequestTranslationData {
  readonly messageId: string;
  readonly targetLanguage: string;
}

/**
 * Données pour ajouter une réaction
 */
export interface ReactionAddData {
  readonly messageId: string;
  readonly emoji: string;
}

/**
 * Données pour retirer une réaction
 */
export interface ReactionRemoveData {
  readonly messageId: string;
  readonly emoji: string;
}

// Événements du client vers le serveur
export interface ClientToServerEvents {
  [CLIENT_EVENTS.MESSAGE_SEND]: (data: MessageSendData, callback?: (response: SocketIOResponse<MessageSendResponseData>) => void) => void;
  [CLIENT_EVENTS.MESSAGE_SEND_WITH_ATTACHMENTS]: (data: MessageSendWithAttachmentsData, callback?: (response: SocketIOResponse<MessageSendResponseData>) => void) => void;
  [CLIENT_EVENTS.MESSAGE_EDIT]: (data: MessageEditData, callback?: (response: SocketIOResponse) => void) => void;
  [CLIENT_EVENTS.MESSAGE_DELETE]: (data: MessageDeleteData, callback?: (response: SocketIOResponse) => void) => void;
  [CLIENT_EVENTS.CONVERSATION_JOIN]: (data: ConversationActionData) => void;
  [CLIENT_EVENTS.CONVERSATION_LEAVE]: (data: ConversationActionData) => void;
  [CLIENT_EVENTS.TYPING_START]: (data: TypingActionData) => void;
  [CLIENT_EVENTS.TYPING_STOP]: (data: TypingActionData) => void;
  [CLIENT_EVENTS.USER_STATUS]: (data: UserStatusData) => void;
  [CLIENT_EVENTS.AUTHENTICATE]: (data: AuthenticateData) => void;
  [CLIENT_EVENTS.REQUEST_TRANSLATION]: (data: RequestTranslationData) => void;
  [CLIENT_EVENTS.REACTION_ADD]: (data: ReactionAddData, callback?: (response: SocketIOResponse<ReactionUpdateEventData>) => void) => void;
  [CLIENT_EVENTS.REACTION_REMOVE]: (data: ReactionRemoveData, callback?: (response: SocketIOResponse<ReactionUpdateEventData>) => void) => void;
  [CLIENT_EVENTS.REACTION_REQUEST_SYNC]: (messageId: string, callback?: (response: SocketIOResponse<ReactionSyncEventData>) => void) => void;
  [CLIENT_EVENTS.CALL_INITIATE]: (data: CallInitiateEvent) => void;
  [CLIENT_EVENTS.CALL_JOIN]: (data: CallJoinEvent) => void;
  [CLIENT_EVENTS.CALL_LEAVE]: (data: { callId: string }) => void;
  [CLIENT_EVENTS.CALL_SIGNAL]: (data: CallSignalEvent) => void;
  [CLIENT_EVENTS.CALL_TOGGLE_AUDIO]: (data: { callId: string; enabled: boolean }) => void;
  [CLIENT_EVENTS.CALL_TOGGLE_VIDEO]: (data: { callId: string; enabled: boolean }) => void;
  [CLIENT_EVENTS.CALL_END]: (data: { callId: string }) => void;
}

// ===== TYPES DE BASE =====

/**
 * Types de messages supportés dans l'architecture Meeshy
 * Défini une fois, réutilisé partout
 */
export type MessageType = 'text' | 'image' | 'file' | 'audio' | 'video' | 'location' | 'system';

// ===== STRUCTURES DE DONNÉES =====

export interface SocketIOMessage {
  id: string;
  conversationId: string;
  senderId?: string; // ID unique - sera résolu en User ou AnonymousParticipant via requête
  anonymousSenderId?: string; // ID de l'expéditeur anonyme
  content: string;
  originalLanguage: string;
  messageType: MessageType;
  isEdited?: boolean; // Indique si le message a été édité
  isDeleted?: boolean; // Indique si le message a été supprimé
  editedAt?: Date; // Présent = message édité
  deletedAt?: Date; // Présent = message supprimé
  replyToId?: string; // Support des réponses
  createdAt: Date;
  updatedAt?: Date; // Date de dernière modification
  // Sender résolu (authentifié ou anonyme) - sera attaché via requête
  sender?: SocketIOUser | AnonymousParticipant;

}

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

/**
 * User type for Socket.IO communications
 * Aligned with schema.prisma User model
 */
export interface SocketIOUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  displayName?: string;
  avatar?: string;
  banner?: string;  // Profile banner/cover image
  bio?: string;
  role: string;
  permissions?: UserPermissions;
  isOnline: boolean;
  lastActiveAt: Date;
  timezone?: string;  // IANA format (e.g., "America/New_York")

  // Blocked users
  blockedUserIds?: string[];

  // Language preferences
  systemLanguage: string;
  regionalLanguage: string;
  customDestinationLanguage?: string;
  autoTranslateEnabled: boolean;
  translateToSystemLanguage: boolean;
  translateToRegionalLanguage: boolean;
  useCustomDestination: boolean;

  // Account status
  isActive: boolean;
  deactivatedAt?: Date;
  deletedAt?: Date;
  deletedBy?: string;

  // Verification statuses
  emailVerifiedAt?: Date;
  phoneVerifiedAt?: Date;
  twoFactorEnabledAt?: Date;

  // Security fields
  failedLoginAttempts?: number;
  lockedUntil?: Date;
  lockedReason?: string;
  lastPasswordChange?: Date;
  passwordResetAttempts?: number;
  lastPasswordResetAttempt?: Date;

  // Login tracking
  lastLoginIp?: string;
  lastLoginLocation?: string;
  lastLoginDevice?: string;

  // E2EE / Signal Protocol
  encryptionPreference?: 'disabled' | 'optional' | 'always';
  signalIdentityKeyPublic?: string;  // Base64 encoded
  signalRegistrationId?: number;
  signalPreKeyBundleVersion?: number;
  lastKeyRotation?: Date;

  // Voice profile
  voiceProfileConsentAt?: Date;
  ageVerificationConsentAt?: Date;
  birthDate?: Date;
  voiceCloningEnabledAt?: Date;
  voiceProfileUpdateNotifiedAt?: Date;

  // Metadata
  profileCompletionRate?: number;
  createdAt: Date;
  updatedAt: Date;

  // Compatibility flags
  isAnonymous?: boolean;
  isMeeshyer?: boolean;
}

export interface SocketIOResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TranslationEvent {
  messageId: string;
  translations: TranslationData[];
}

export interface TranslationData {
  id: string; // ID de la traduction en base de données
  messageId: string;
  sourceLanguage: string;
  targetLanguage: string;
  translatedContent: string;
  translationModel: string;
  cacheKey: string;
  cached: boolean;
  confidenceScore?: number;
  createdAt?: Date; // Ajouté pour la gestion des traductions
}

export interface TypingEvent {
  userId: string;
  username: string;
  conversationId: string;
  isTyping?: boolean; // Ajouté côté service pour distinguer start/stop
}

export interface UserStatusEvent {
  userId: string;
  username: string;
  isOnline: boolean;
  lastActiveAt?: Date | null;
}

// ===== TYPES POUR LES STATISTIQUES DE CONVERSATION =====

export interface ConversationOnlineUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
}

export interface ConversationStatsDTO {
  messagesPerLanguage: Record<string, number>;
  participantCount: number;
  participantsPerLanguage: Record<string, number>;
  onlineUsers: ConversationOnlineUser[];
  updatedAt: Date;
}

// ===== TYPES DE CONFIGURATION =====

export interface UserLanguageConfig {
  systemLanguage: string;
  regionalLanguage: string;
  customDestinationLanguage?: string;
  autoTranslateEnabled: boolean;
  translateToSystemLanguage: boolean;
  translateToRegionalLanguage: boolean;
  useCustomDestination: boolean;
}

// ===== HELPERS POUR LA GESTION DES TRADUCTIONS =====

export interface MessageTranslationCache {
  messageId: string;
  sourceLanguage: string;
  targetLanguage: string;
  translatedContent: string;
  translationModel: 'basic' | 'medium' | 'premium';
  cacheKey: string;
  cached: boolean;
  createdAt: Date;
  confidenceScore?: number;
}

// ===== TYPES POUR LES CONNEXIONS =====

export interface ConnectionStatus {
  isConnected: boolean;
  hasSocket: boolean;
  currentUser: string;
  connectedAt?: Date;
  lastReconnectAttempt?: Date;
  reconnectAttempts?: number;
}

export interface ConnectionDiagnostics {
  connectionStatus: ConnectionStatus;
  socketId?: string;
  transport?: string;
  connectedSockets?: number;
  serverStatus?: 'online' | 'offline' | 'unknown';
}

// ===== TYPES POUR L'AUTHENTIFICATION =====

/**
 * Listener générique pour les événements Socket.IO
 */
export type SocketEventListener = (...args: readonly unknown[]) => void;

/**
 * Base Socket interface pour éviter l'import de socket.io dans shared
 */
export interface BaseSocket {
  readonly id: string;
  emit: (event: string, ...args: readonly unknown[]) => boolean;
  on: (event: string, listener: SocketEventListener) => void;
  join: (room: string) => void;
  leave: (room: string) => void;
}

/**
 * Socket authentifié avec métadonnées utilisateur
 */
export interface AuthenticatedSocket extends BaseSocket {
  readonly userId: string;
  readonly username: string;
  readonly userData: SocketIOUser;
  readonly connectedAt: Date;
  readonly currentConversations: readonly string[];
}

// ===== EXPORTS POUR RÉTROCOMPATIBILITÉ =====

// Aliases pour faciliter la migration
// ❌ SUPPRIMÉ : export type Message = SocketIOMessage; // Conflit avec conversation.ts
export type User = SocketIOUser;
export type Response<T = unknown> = SocketIOResponse<T>;

// Export des interfaces principales
export type {
  ServerToClientEvents as SocketIOServerEvents,
  ClientToServerEvents as SocketIOClientEvents
};
