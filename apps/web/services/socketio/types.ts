/**
 * Types for Socket.IO service modules
 * Centralized type definitions for the refactored SocketIO services
 */

import type { Socket } from 'socket.io-client';
import type {
  Message,
  User,
  SocketIOMessage,
  TypingEvent,
  UserStatusEvent,
  TranslationEvent,
  ServerToClientEvents,
  ClientToServerEvents,
  AudioTranslationReadyEventData
} from '@/types';
import type {
  TranscriptionReadyEventData,
  AudioTranslationsProgressiveEventData,
  AudioTranslationsCompletedEventData
} from '@meeshy/shared/types/socketio-events';
import type { EncryptedPayload, EncryptionMode } from '@meeshy/shared/types/encryption';

/**
 * Socket.IO typed socket instance
 */
export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Event listener type definitions
 */
export type MessageListener = (message: Message) => void;
export type MessageEditListener = (message: Message) => void;
export type MessageDeleteListener = (messageId: string) => void;
export type TranslationListener = (data: TranslationEvent) => void;
export type AudioTranslationListener = (data: AudioTranslationReadyEventData) => void;
export type AudioTranslationsProgressiveListener = (data: AudioTranslationsProgressiveEventData) => void;
export type AudioTranslationsCompletedListener = (data: AudioTranslationsCompletedEventData) => void;
export type TranscriptionListener = (data: TranscriptionReadyEventData) => void;
export type TypingListener = (event: TypingEvent) => void;
export type UserStatusListener = (event: UserStatusEvent) => void;
export type ConversationStatsListener = (data: { conversationId: string; stats: any }) => void;
export type OnlineStatsListener = (data: { conversationId: string; onlineUsers: any[]; updatedAt: Date }) => void;
export type ReactionListener = (data: any) => void;
export type ConversationJoinedListener = (data: { conversationId: string; userId: string }) => void;
export type ReadStatusListener = (data: { conversationId: string; userId: string; type: 'read' | 'received'; updatedAt: Date }) => void;

/**
 * Unsubscribe function type
 */
export type UnsubscribeFn = () => void;

/**
 * Connection state
 */
export interface ConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  reconnectAttempts: number;
  socket: TypedSocket | null;
}

/**
 * Connection status information
 */
export interface ConnectionStatus {
  isConnected: boolean;
  hasSocket: boolean;
  currentUser: string;
}

/**
 * Connection diagnostics
 */
export interface ConnectionDiagnostics {
  isConnected: boolean;
  hasSocket: boolean;
  hasToken: boolean;
  url: string;
  socketId?: string;
  transport?: string;
  reconnectAttempts: number;
  currentUser?: string;
  listenersCount: {
    message: number;
    edit: number;
    delete: number;
    translation: number;
    typing: number;
    status: number;
  };
}

/**
 * Encryption handlers for E2EE
 */
export interface EncryptionHandlers {
  encrypt: (content: string, conversationId: string) => Promise<EncryptedPayload | null>;
  decrypt: (payload: EncryptedPayload, senderUserId?: string) => Promise<string>;
  getConversationMode: (conversationId: string) => Promise<EncryptionMode | null>;
}

/**
 * Message callback for retrieving messages by ID
 */
export type GetMessageByIdCallback = (messageId: string) => Message | undefined;

/**
 * Translation cache entry
 */
export interface TranslationCacheEntry {
  messageId: string;
  targetLanguage: string;
  translation: any;
}

/**
 * Typing user state
 */
export interface TypingUserState {
  userId: string;
  conversationId: string;
  timeout?: NodeJS.Timeout;
}

/**
 * Service event emitter
 */
export interface ServiceEventEmitter {
  on(event: string, listener: (...args: any[]) => void): UnsubscribeFn;
  emit(event: string, ...args: any[]): void;
  removeAllListeners(): void;
}

/**
 * Message send options
 */
export interface MessageSendOptions {
  conversationId: string;
  content: string;
  originalLanguage?: string;
  replyToId?: string;
  mentionedUserIds?: string[];
  attachmentIds?: string[];
  attachmentMimeTypes?: string[];
}

/**
 * Message send result
 */
export interface MessageSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}
