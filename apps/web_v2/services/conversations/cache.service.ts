/**
 * Service de gestion du cache
 * Responsabilité: Gérer le cache des conversations, messages et participants
 */

import type {
  Conversation,
  Message,
  User,
} from '@meeshy/shared/types';
import type {
  ConversationsCache,
  MessagesCache,
  ParticipantsCache,
} from './types';

/**
 * Service de gestion du cache
 */
export class CacheService {
  private conversationsCache: ConversationsCache | null = null;
  private readonly CACHE_DURATION = 120000; // 2 minutes

  private messagesCache: Map<string, MessagesCache> = new Map();
  private readonly MESSAGES_CACHE_DURATION = 60000; // 1 minute

  private participantsCache: Map<string, ParticipantsCache> = new Map();
  private readonly PARTICIPANTS_CACHE_DURATION = 30000; // 30 secondes

  /**
   * Vérifie si le cache des conversations est valide
   */
  isConversationsCacheValid(): boolean {
    if (!this.conversationsCache) return false;
    return (Date.now() - this.conversationsCache.timestamp) < this.CACHE_DURATION;
  }

  /**
   * Récupère les conversations du cache
   */
  getConversationsFromCache(): Conversation[] | null {
    if (this.isConversationsCacheValid()) {
      return this.conversationsCache!.data;
    }
    return null;
  }

  /**
   * Met en cache les conversations
   */
  setConversationsCache(conversations: Conversation[]): void {
    this.conversationsCache = {
      data: conversations,
      timestamp: Date.now()
    };
  }

  /**
   * Invalide le cache des conversations
   */
  invalidateConversationsCache(): void {
    this.conversationsCache = null;
  }

  /**
   * Vérifie si le cache des messages est valide
   */
  isMessagesCacheValid(conversationId: string): boolean {
    const cached = this.messagesCache.get(conversationId);
    if (!cached) return false;
    return (Date.now() - cached.timestamp) < this.MESSAGES_CACHE_DURATION;
  }

  /**
   * Récupère les messages du cache
   */
  getMessagesFromCache(conversationId: string): MessagesCache | null {
    if (this.isMessagesCacheValid(conversationId)) {
      return this.messagesCache.get(conversationId) || null;
    }
    return null;
  }

  /**
   * Met en cache les messages
   */
  setMessagesCache(conversationId: string, messages: Message[], hasMore: boolean): void {
    this.messagesCache.set(conversationId, {
      data: messages,
      timestamp: Date.now(),
      hasMore
    });
  }

  /**
   * Invalide le cache des messages pour une conversation
   */
  invalidateMessagesCache(conversationId?: string): void {
    if (conversationId) {
      this.messagesCache.delete(conversationId);
    } else {
      this.messagesCache.clear();
    }
  }

  /**
   * Vérifie si le cache des participants est valide
   */
  isParticipantsCacheValid(cacheKey: string): boolean {
    const cached = this.participantsCache.get(cacheKey);
    if (!cached) return false;
    return (Date.now() - cached.timestamp) < this.PARTICIPANTS_CACHE_DURATION;
  }

  /**
   * Récupère les participants du cache
   */
  getParticipantsFromCache(cacheKey: string): User[] | null {
    if (this.isParticipantsCacheValid(cacheKey)) {
      return this.participantsCache.get(cacheKey)?.data || null;
    }
    return null;
  }

  /**
   * Met en cache les participants
   */
  setParticipantsCache(cacheKey: string, participants: User[]): void {
    this.participantsCache.set(cacheKey, {
      data: participants,
      timestamp: Date.now()
    });
  }

  /**
   * Invalide le cache des participants
   */
  invalidateParticipantsCache(cacheKey?: string): void {
    if (cacheKey) {
      this.participantsCache.delete(cacheKey);
    } else {
      this.participantsCache.clear();
    }
  }

  /**
   * Invalide tout le cache
   */
  invalidateAllCaches(): void {
    this.invalidateConversationsCache();
    this.invalidateMessagesCache();
    this.invalidateParticipantsCache();
  }
}

export const cacheService = new CacheService();
