/**
 * Fastify Type Extensions for Meeshy Gateway
 * 
 * This file extends the FastifyInstance interface to include our custom decorators
 * and properties that are available throughout the application.
 */

import Redis from 'ioredis';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { MessageTranslationService } from '../services/message-translation/MessageTranslationService';
import { SocialEventsHandler } from '../socketio/handlers/SocialEventsHandler';
import { NotificationService } from '../services/notifications/NotificationService';
import { MutationLogService } from '../services/MutationLogService';
import { EmailService } from '../services/EmailService';
import { MessagingService } from '../services/messaging/MessagingService';
import { MentionService } from '../services/MentionService';
import { MultiLevelJobMappingCache } from '../services/MultiLevelJobMappingCache';
import { MeeshySocketIOHandler } from '../socketio/MeeshySocketIOHandler';
import { FastifyRequest, FastifyReply } from 'fastify';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: { userId: string; username: string; role: string; isAnonymous?: boolean };
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: { userId?: string; isAuthenticated: boolean; isAnonymous: boolean };
    __startTime?: number;
    file: () => Promise<import('@fastify/multipart').MultipartFile | undefined>;
  }

  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis | null;
    translationService: MessageTranslationService;
    socialEvents: SocialEventsHandler;
    notificationService: NotificationService;
    mutationLogService: MutationLogService;
    emailService: EmailService;
    messagingService: MessagingService;
    mentionService: MentionService;
    jobMappingCache: MultiLevelJobMappingCache;
    socketIOHandler: MeeshySocketIOHandler;
    presenceChecker: {
      isOnline: (id: string) => boolean;
      bulk: (ids: readonly string[]) => Map<string, boolean>;
      listOnlineAmong: (ids: readonly string[]) => string[];
    };
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
