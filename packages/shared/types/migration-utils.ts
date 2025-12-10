/**
 * Utilitaires de migration pour les types unifiés
 * Facilite la transition vers les nouveaux types Phase 1
 */

import type { Message, Conversation } from './conversation';
import type { SocketIOUser as User, SocketIOUser } from './socketio-events';
import type { AnonymousParticipant } from './anonymous';
import type { ApiResponse } from './api-responses';

/**
 * Convertit un SocketIOUser vers User unifié
 */
export function socketIOUserToUser(socketUser: SocketIOUser): User {
  return {
    id: socketUser.id,
    username: socketUser.username,
    firstName: socketUser.firstName,
    lastName: socketUser.lastName,
    email: socketUser.email,
    phoneNumber: socketUser.phoneNumber,
    displayName: socketUser.displayName,
    avatar: socketUser.avatar,
    role: socketUser.role, // Déjà string, compatible directement
    permissions: socketUser.permissions,
    isOnline: socketUser.isOnline,
    lastSeen: socketUser.lastSeen,
    lastActiveAt: socketUser.lastActiveAt,
    systemLanguage: socketUser.systemLanguage,
    regionalLanguage: socketUser.regionalLanguage,
    customDestinationLanguage: socketUser.customDestinationLanguage,
    autoTranslateEnabled: socketUser.autoTranslateEnabled,
    translateToSystemLanguage: socketUser.translateToSystemLanguage,
    translateToRegionalLanguage: socketUser.translateToRegionalLanguage,
    useCustomDestination: socketUser.useCustomDestination,
    isActive: socketUser.isActive,
    deactivatedAt: socketUser.deactivatedAt,
    createdAt: socketUser.createdAt,
    updatedAt: socketUser.updatedAt,
    isAnonymous: socketUser.isAnonymous,
    isMeeshyer: socketUser.isMeeshyer
  };
}

/**
 * Vérifie si un ID est un ObjectId MongoDB valide
 */
export function isValidObjectId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-fA-F]{24}$/.test(id);
}

/**
 * Type guard pour vérifier si un objet a une propriété id valide
 */
function hasValidId(obj: unknown): obj is { id: string } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    typeof (obj as { id: unknown }).id === 'string' &&
    isValidObjectId((obj as { id: string }).id)
  );
}

/**
 * Type guard pour vérifier si un objet a une propriété identifier
 */
function hasIdentifier(obj: unknown): obj is { identifier: string } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'identifier' in obj &&
    typeof (obj as { identifier: unknown }).identifier === 'string'
  );
}

/**
 * Type guard pour vérifier si un objet ressemble à une conversation
 */
export function isConversationLike(obj: unknown): obj is { id: string; identifier?: string } {
  return hasValidId(obj);
}

/**
 * Extrait l'ObjectId d'un objet conversation pour les API
 */
export function getApiConversationId(conversation: unknown): string {
  if (!conversation) {
    throw new Error('Conversation object is null or undefined');
  }
  
  if (!hasValidId(conversation)) {
    throw new Error(`Invalid conversation object: missing valid ObjectId. Got: ${JSON.stringify(conversation)}`);
  }
  
  return conversation.id;
}

/**
 * Extrait l'identifier d'affichage d'une conversation
 */
export function getDisplayConversationId(conversation: unknown): string {
  if (!conversation) {
    throw new Error('Conversation object is null or undefined');
  }
  
  // Priorité à l'identifier pour les URLs
  if (hasIdentifier(conversation)) {
    return conversation.identifier;
  }
  
  // Fallback sur l'ID
  if (hasValidId(conversation)) {
    return conversation.id;
  }
  
  throw new Error(`Invalid conversation object: missing identifier and id. Got: ${JSON.stringify(conversation)}`);
}

/**
 * Type pour les métadonnées de réponse API
 */
export type ApiResponseMeta = Readonly<Record<string, string | number | boolean | null>>;

/**
 * Crée une réponse API de succès
 */
export function createApiSuccessResponse<T>(data: T, meta?: ApiResponseMeta): ApiResponse<T> {
  return {
    success: true,
    data,
    meta
  };
}

/**
 * Crée une réponse API d'erreur
 */
export function createApiErrorResponse(error: string, code?: string): ApiResponse<never> {
  return {
    success: false,
    error,
    code
  };
}

/**
 * Type guard pour vérifier si c'est un utilisateur authentifié
 */
export function isAuthenticatedUser(sender: User | AnonymousParticipant | undefined): sender is User {
  return sender !== undefined && 'email' in sender;
}

/**
 * Type guard pour vérifier si c'est un participant anonyme
 */
export function isAnonymousParticipant(sender: User | AnonymousParticipant | undefined): sender is AnonymousParticipant {
  return sender !== undefined && 'sessionToken' in sender;
}

/**
 * Type guard pour vérifier si un objet ressemble à un message brut
 */
function isRawMessageLike(obj: unknown): obj is { 
  id: unknown; 
  conversationId: unknown; 
  content: unknown;
} {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'conversationId' in obj &&
    'content' in obj
  );
}

/**
 * Normalise un message depuis différentes sources
 * Assure la synchronisation entre createdAt et timestamp
 */
export function normalizeMessage(rawMessage: unknown): Message {
  if (!isRawMessageLike(rawMessage)) {
    throw new Error('Invalid message object: missing required fields');
  }

  const raw = rawMessage as Record<string, unknown>;
  
  // Helper pour normaliser les dates
  const toDate = (val: unknown): Date => {
    if (val instanceof Date) return val;
    if (typeof val === 'string' || typeof val === 'number') return new Date(val);
    return new Date();
  };

  const normalizedMessage: Message = {
    id: String(raw.id),
    conversationId: String(raw.conversationId),
    senderId: raw.senderId ? String(raw.senderId) : undefined,
    anonymousSenderId: raw.anonymousSenderId ? String(raw.anonymousSenderId) : undefined,
    content: String(raw.content),
    originalLanguage: String(raw.originalLanguage || 'fr'),
    messageType: (raw.messageType as 'text' | 'image' | 'file' | 'audio' | 'video' | 'location' | 'system') || 'text',
    isEdited: Boolean(raw.isEdited),
    isDeleted: Boolean(raw.isDeleted),
    replyToId: raw.replyToId ? String(raw.replyToId) : undefined,
    createdAt: toDate(raw.createdAt || raw.timestamp),
    updatedAt: toDate(raw.updatedAt || raw.createdAt || raw.timestamp),
    editedAt: raw.editedAt ? toDate(raw.editedAt) : undefined,
    deletedAt: raw.deletedAt ? toDate(raw.deletedAt) : undefined,
    
    // Synchroniser timestamp avec createdAt pour compatibilité
    timestamp: toDate(raw.createdAt || raw.timestamp),
    
    sender: (raw.sender || raw.anonymousSender) as User | AnonymousParticipant | undefined,
    anonymousSender: raw.anonymousSender ? {
      id: String((raw.anonymousSender as any).id),
      username: String((raw.anonymousSender as any).username || ''),
      firstName: String((raw.anonymousSender as any).firstName || ''),
      lastName: String((raw.anonymousSender as any).lastName || ''),
      language: String((raw.anonymousSender as any).language || 'fr'),
      isMeeshyer: Boolean((raw.anonymousSender as any).isMeeshyer)
    } : undefined,
    translations: Array.isArray(raw.translations) ? raw.translations : [],
    replyTo: raw.replyTo ? normalizeMessage(raw.replyTo) : undefined
  };
  
  return normalizedMessage;
}

/**
 * Type guard pour vérifier si un objet ressemble à une conversation brute
 */
function isRawConversationLike(obj: unknown): obj is {
  id: unknown;
  createdAt: unknown;
  updatedAt: unknown;
} {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'createdAt' in obj &&
    'updatedAt' in obj
  );
}

/**
 * Normalise une conversation depuis différentes sources
 * Assure la synchronisation entre les alias de champs
 */
export function normalizeConversation(rawConversation: unknown): Conversation {
  if (!isRawConversationLike(rawConversation)) {
    throw new Error('Invalid conversation object: missing required fields');
  }

  const raw = rawConversation as Record<string, unknown>;
  
  // Helper pour normaliser les dates
  const toDate = (val: unknown): Date => {
    if (val instanceof Date) return val;
    if (typeof val === 'string' || typeof val === 'number') return new Date(val);
    return new Date();
  };

  const normalizedConversation: Conversation = {
    id: String(raw.id),
    identifier: raw.identifier as string | undefined,
    type: (raw.type as 'direct' | 'group' | 'public' | 'global' | 'broadcast') || 'direct',
    title: raw.title as string | undefined,
    description: raw.description as string | undefined,
    status: (raw.status as 'active' | 'archived' | 'deleted') || 'active',
    visibility: (raw.visibility as 'public' | 'private' | 'restricted') || 'private',
    lastMessage: raw.lastMessage ? normalizeMessage(raw.lastMessage) : undefined,
    messageCount: Number(raw.messageCount || 0),
    unreadCount: Number(raw.unreadCount || 0),
    participants: Array.isArray(raw.participants) ? raw.participants as Conversation['participants'] : [],
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
    lastActivityAt: raw.lastActivityAt ? toDate(raw.lastActivityAt) : undefined,
    createdBy: raw.createdBy as string | undefined
  };
  
  return normalizedConversation;
}
