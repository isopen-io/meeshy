/**
 * Types and interfaces for attachment routes
 */

import type { FastifyRequest } from 'fastify';

export interface AuthContext {
  userId: string;
  isAuthenticated: boolean;
  isAnonymous: boolean;
  anonymousParticipant?: {
    id: string;
    shareLinkId: string;
    conversationId: string;
  };
  registeredUser?: {
    role: 'USER' | 'ADMIN' | 'BIGBOSS';
  };
}

export interface UploadedFile {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  size: number;
}

export interface UploadTextBody {
  content: string;
  messageId?: string;
}

export interface TranslateBody {
  targetLanguages: string[];
  sourceLanguage?: string;
  generateVoiceClone?: boolean;
  async?: boolean;
  webhookUrl?: string;
  priority?: number;
}

export interface ConversationAttachmentsQuery {
  type?: 'image' | 'document' | 'audio' | 'video' | 'text';
  limit?: number;
  offset?: number;
}

export interface AttachmentParams {
  attachmentId: string;
}

export interface ConversationParams {
  conversationId: string;
}

export interface AuthenticatedRequest extends FastifyRequest {
  authContext: AuthContext;
}
