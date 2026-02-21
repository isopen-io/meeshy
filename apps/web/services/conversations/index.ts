/**
 * Service Facade pour les conversations
 * Responsabilité: Fournir une API unifiée et maintenir la compatibilité avec l'ancien service
 *
 * Ce service combine les sous-services spécialisés et expose une interface unique
 * pour garantir une compatibilité totale avec l'API existante.
 */

import { conversationsCrudService } from './crud.service';
import { messagesService } from './messages.service';
import { participantsService } from './participants.service';
import { linksService } from './links.service';
import { cacheService } from './cache.service';
import type {
  Conversation,
  Message,
  User,
  CreateConversationRequest,
  SendMessageRequest,
  PaginationMeta,
} from '@meeshy/shared/types';
import type {
  ParticipantsFilters,
  GetConversationsOptions,
  GetConversationsResponse,
  GetMessagesResponse,
  AllParticipantsResponse,
  CreateLinkData,
  MarkAsReadResponse,
} from './types';

/**
 * Service Facade unifié pour les conversations
 * Maintient la compatibilité avec l'API existante tout en utilisant les services spécialisés
 */
export class ConversationsService {
  // Expose cache properties for backward compatibility with tests
  get conversationsCache() {
    return (cacheService as any).conversationsCache;
  }
  set conversationsCache(value) {
    (cacheService as any).conversationsCache = value;
  }

  get messagesCache() {
    return (cacheService as any).messagesCache;
  }

  get participantsCache() {
    return (cacheService as any).participantsCache;
  }
  // ===== CRUD OPERATIONS =====

  /**
   * Obtenir toutes les conversations de l'utilisateur
   */
  async getConversations(options: GetConversationsOptions = {}): Promise<GetConversationsResponse> {
    return conversationsCrudService.getConversations(options);
  }

  /**
   * Obtenir une conversation spécifique par ID
   */
  async getConversation(id: string): Promise<Conversation> {
    return conversationsCrudService.getConversation(id);
  }

  /**
   * Créer une nouvelle conversation
   */
  async createConversation(data: CreateConversationRequest): Promise<Conversation> {
    return conversationsCrudService.createConversation(data);
  }

  /**
   * Mettre à jour une conversation
   */
  async updateConversation(id: string, data: Partial<Conversation>): Promise<Conversation> {
    return conversationsCrudService.updateConversation(id, data);
  }

  /**
   * Supprimer une conversation
   */
  async deleteConversation(id: string): Promise<void> {
    return conversationsCrudService.deleteConversation(id);
  }

  /**
   * Rechercher dans les conversations
   */
  async searchConversations(query: string): Promise<Conversation[]> {
    return conversationsCrudService.searchConversations(query);
  }

  /**
   * Obtenir toutes les conversations directes avec un utilisateur spécifique
   */
  async getConversationsWithUser(userId: string): Promise<Conversation[]> {
    return conversationsCrudService.getConversationsWithUser(userId);
  }

  // ===== MESSAGE OPERATIONS =====

  /**
   * Obtenir les messages d'une conversation avec pagination
   */
  async getMessages(
    conversationId: string,
    page = 1,
    limit = 20,
    cursor?: string | null
  ): Promise<GetMessagesResponse> {
    return messagesService.getMessages(conversationId, page, limit, cursor);
  }

  /**
   * Envoyer un message dans une conversation
   */
  async sendMessage(conversationId: string, data: SendMessageRequest): Promise<Message> {
    return messagesService.sendMessage(conversationId, data);
  }

  /**
   * Marquer une conversation comme lue
   */
  async markAsRead(conversationId: string): Promise<void> {
    return messagesService.markAsRead(conversationId);
  }

  /**
   * Marquer tous les messages d'une conversation comme lus
   */
  async markConversationAsRead(conversationId: string): Promise<MarkAsReadResponse> {
    return messagesService.markConversationAsRead(conversationId);
  }

  // ===== PARTICIPANT OPERATIONS =====

  /**
   * Obtenir les participants d'une conversation
   */
  async getParticipants(conversationId: string, filters?: ParticipantsFilters): Promise<User[]> {
    return participantsService.getParticipants(conversationId, filters);
  }

  /**
   * Obtenir tous les participants (authentifiés et anonymes)
   */
  async getAllParticipants(conversationId: string): Promise<AllParticipantsResponse> {
    return participantsService.getAllParticipants(conversationId);
  }

  /**
   * Ajouter un participant à une conversation
   */
  async addParticipant(conversationId: string, userId: string): Promise<void> {
    return participantsService.addParticipant(conversationId, userId);
  }

  /**
   * Supprimer un participant d'une conversation
   */
  async removeParticipant(conversationId: string, userId: string): Promise<void> {
    return participantsService.removeParticipant(conversationId, userId);
  }

  /**
   * Mettre à jour le rôle d'un participant
   */
  async updateParticipantRole(
    conversationId: string,
    userId: string,
    role: 'ADMIN' | 'MODERATOR' | 'MEMBER'
  ): Promise<void> {
    return participantsService.updateParticipantRole(conversationId, userId, role);
  }

  // ===== LINK OPERATIONS =====

  /**
   * Créer un lien d'invitation pour une conversation
   */
  async createInviteLink(conversationId: string, linkData?: CreateLinkData): Promise<string> {
    return linksService.createInviteLink(conversationId, linkData);
  }

  /**
   * Créer une nouvelle conversation avec un lien d'invitation
   */
  async createConversationWithLink(linkData: CreateLinkData = {}): Promise<string> {
    return linksService.createConversationWithLink(linkData);
  }

  // ===== CACHE OPERATIONS =====

  /**
   * Invalider tout le cache
   */
  invalidateAllCaches(): void {
    cacheService.invalidateAllCaches();
  }

  /**
   * Invalider le cache des conversations
   */
  invalidateConversationsCache(): void {
    cacheService.invalidateConversationsCache();
  }

  /**
   * Invalider le cache des messages
   */
  invalidateMessagesCache(conversationId?: string): void {
    cacheService.invalidateMessagesCache(conversationId);
  }

  /**
   * Invalider le cache des participants
   */
  invalidateParticipantsCache(cacheKey?: string): void {
    cacheService.invalidateParticipantsCache(cacheKey);
  }
}

// Instance singleton pour compatibilité avec l'ancien service
export const conversationsService = new ConversationsService();

// Exporter les types pour les consommateurs
export type {
  ParticipantsFilters,
  GetConversationsOptions,
  GetConversationsResponse,
  GetMessagesResponse,
  AllParticipantsResponse,
  CreateLinkData,
  MarkAsReadResponse,
};
