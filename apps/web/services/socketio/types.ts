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
export type ConversationStatsListener = (data: { conversationId: string; stats: Record<string, unknown> }) => void;
export type OnlineStatsListener = (data: { conversationId: string; onlineUsers: readonly { userId: string; displayName?: string }[]; updatedAt: Date }) => void;
export type ReactionListener = (data: { messageId: string; userId: string; emoji: string; conversationId: string }) => void;
export type ConversationJoinedListener = (data: { conversationId: string; userId: string }) => void;
export type ReadStatusListener = (data: { conversationId: string; participantId: string; type: 'read' | 'received'; updatedAt: Date; summary: { totalMembers: number; deliveredCount: number; readCount: number } }) => void;

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
 * Connection status — simple string union returned by ConnectionService
 */
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

/**
 * Connection diagnostics
 */
export interface ConnectionDiagnostics {
  status: ConnectionStatus;
  reconnectAttempts: number;
  transport: string;
  socketId: string | null;
  listenersCount?: {
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
  translation: { translatedContent: string; targetLanguage: string; model?: string };
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
  on(event: string, listener: (...args: unknown[]) => void): UnsubscribeFn;
  emit(event: string, ...args: unknown[]): void;
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
  forwardedFromId?: string;
  forwardedFromConversationId?: string;
  mentionedUserIds?: string[];
  attachmentIds?: string[];
  attachmentMimeTypes?: string[];
  clientMessageId?: string;
}

export interface MessageAckResponse {
  success: boolean;
  messageId?: string;
  clientMessageId?: string;
  timedOut?: boolean;
}

/**
 * Message send result
 */
export interface MessageSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}
