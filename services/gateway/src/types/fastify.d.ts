/**
 * Fastify Type Extensions for Meeshy Gateway
 * 
 * This file extends the FastifyInstance interface to include our custom decorators
 * and properties that are available throughout the application.
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import { TranslationService } from '../services/TranslationService';
import { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    translationService: TranslationService;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// Re-export shared types for convenience
// Note: Ces types peuvent être réactivés si nécessaire
/* export type { 
  WebSocketMessage, 
  WebSocketMessageData,
  NewMessageAction,
  JoinChatAction,
  StartTypingAction,
  MessageReceivedBroadcast,
  MessageTranslatedBroadcast,
  TypingStartedBroadcast
} from '../../libs/types/websocket-messages'; */

// Gateway-specific types
export interface WebSocketResponse {
  type: 'translation' | 'translation_multi' | 'error' | 'typing' | 'stop_typing' | 'message_sent' | 'conversation_joined' | 'conversation_left';
  messageId?: string;
  originalText?: string;
  translatedText?: string;
  translations?: Array<{
    language: string;
    text: string;
    confidence: number;
  }>;
  sourceLanguage?: string;
  targetLanguage?: string;
  confidence?: number;
  fromCache?: boolean;
  modelUsed?: string;
  conversationId?: string;
  userId?: string;
  error?: string;
  data?: any; // Pour les données spécifiques au type de réponse
  timestamp: string;
}

export interface WebSocketConnection {
  send: (data: string) => void;
}

export interface TranslationRequest {
  text: string;
  source_language: string;
  target_language: string;
}
