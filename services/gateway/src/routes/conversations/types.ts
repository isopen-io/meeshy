/**
 * Types TypeScript pour le module conversations
 */

export interface EditMessageBody {
  content: string;
  originalLanguage?: string;
}

export interface ConversationParams {
  id: string;
}

export interface CreateConversationBody {
  type: 'direct' | 'group' | 'public' | 'global';
  title?: string;
  description?: string;
  participantIds?: string[];
  communityId?: string;
  identifier?: string;
}

export interface SendMessageBody {
  content: string;
  originalLanguage?: string;
  messageType?: 'text' | 'image' | 'file' | 'system';
  replyToId?: string;
  // Encryption fields
  encryptedContent?: string;
  encryptionMode?: 'e2ee' | 'server' | 'hybrid';
  encryptionMetadata?: Record<string, any>;
  isEncrypted?: boolean;
  // Audio attachments (pre-uploaded via /attachments/upload)
  attachmentIds?: string[];
}

export interface MessagesQuery {
  limit?: string;
  offset?: string;
  before?: string; // messageId pour pagination
  include_reactions?: string;
  include_translations?: string;
  include_status?: string;
  include_replies?: string;
}

export interface SearchQuery {
  q?: string;
}
