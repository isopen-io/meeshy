import { apiService, ApiResponse } from './api.service';

export interface Message {
  id: string;
  content: string;
  authorId: string;
  conversationId?: string;
  groupId?: string;
  createdAt: string;
  updatedAt: string;
  isEdited: boolean;
  author: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    displayName?: string;
    avatar?: string;
  };
}

export interface CreateMessageDto {
  content: string;
  conversationId?: string;
  groupId?: string;
  replyToId?: string;
}

export interface UpdateMessageDto {
  content: string;
}

export interface MessagesResponse {
  messages: Message[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface MessageSearchResponse {
  messages: Message[];
  total: number;
  query: string;
}

/**
 * Service pour gérer les messages
 */
export const messagesService = {
  /**
   * Crée un nouveau message
   */
  async createMessage(messageData: CreateMessageDto): Promise<ApiResponse<Message>> {
    try {
      const response = await apiService.post<Message>('/messages', messageData);
      return response;
    } catch (error) {
      console.error('Erreur lors de la création du message:', error);
      throw error;
    }
  },

  /**
   * Récupère les messages d'une conversation avec pagination
   */
  async getMessagesByConversation(
    conversationId: string, 
    page: number = 1, 
    limit: number = 20
  ): Promise<ApiResponse<MessagesResponse>> {
    try {
      // Utiliser l'endpoint correct de la gateway avec pagination optimisée
      const response = await apiService.get<{messages: Message[], hasMore: boolean, userLanguage: string}>(
        `/conversations/${conversationId}/messages?limit=${limit}&offset=${(page - 1) * limit}&include_translations=true`
      );
      
      // Adapter la réponse au format attendu
      return {
        data: {
          messages: response.data.messages,
          total: response.data.messages.length, // Approximation
          page: page,
          limit: limit,
          hasMore: response.data.hasMore
        },
        status: response.status,
        message: response.message
      };
    } catch (error) {
      console.error('Erreur lors de la récupération des messages:', error);
      throw error;
    }
  },

  /**
   * Récupère les messages d'une conversation avec pagination par offset
   */
  async getMessagesWithOffset(
    conversationId: string, 
    offset: number = 0, 
    limit: number = 20
  ): Promise<{messages: Message[], hasMore: boolean, userLanguage: string}> {
    try {
      const response = await apiService.get<{messages: Message[], hasMore: boolean, userLanguage: string}>(
        `/conversations/${conversationId}/messages?limit=${limit}&offset=${offset}&include_translations=true`
      );
      
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la récupération des messages avec offset:', error);
      throw error;
    }
  },

  /**
   * Envoie un message dans une conversation
   */
  async sendMessageToConversation(conversationId: string, content: string): Promise<ApiResponse<Message>> {
    try {
      const response = await apiService.post<Message>(`/conversations/${conversationId}/messages`, {
        content,
        conversationId,
      });
      return response;
    } catch (error) {
      console.error('Erreur lors de l\'envoi du message:', error);
      throw error;
    }
  },

  /**
   * Met à jour un message
   */
  async updateMessage(messageId: string, updateData: UpdateMessageDto): Promise<ApiResponse<Message>> {
    try {
      const response = await apiService.patch<Message>(`/messages/${messageId}`, updateData);
      return response;
    } catch (error) {
      console.error('Erreur lors de la mise à jour du message:', error);
      throw error;
    }
  },

  /**
   * Supprime un message
   */
  async deleteMessage(messageId: string): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await apiService.delete<{ message: string }>(`/messages/${messageId}`);
      return response;
    } catch (error) {
      console.error('Erreur lors de la suppression du message:', error);
      throw error;
    }
  },

  /**
   * Recherche dans les messages d'une conversation
   */
  async searchMessages(conversationId: string, query: string): Promise<ApiResponse<MessageSearchResponse>> {
    try {
      const response = await apiService.get<MessageSearchResponse>(
        `/messages/search/${conversationId}?q=${encodeURIComponent(query)}`
      );
      return response;
    } catch (error) {
      console.error('Erreur lors de la recherche de messages:', error);
      throw error;
    }
  },

  /**
   * Formate la date d'un message
   */
  formatMessageDate(createdAt: string): string {
    const messageDate = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - messageDate.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) {
      return 'À l\'instant';
    } else if (diffMinutes < 60) {
      return `${diffMinutes} min`;
    } else if (diffHours < 24) {
      return `${diffHours}h`;
    } else if (diffDays === 1) {
      return 'Hier';
    } else if (diffDays < 7) {
      return `${diffDays} jours`;
    } else {
      return messageDate.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: messageDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      });
    }
  },

  /**
   * Formate l'heure d'un message
   */
  formatMessageTime(createdAt: string): string {
    const messageDate = new Date(createdAt);
    return messageDate.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  },

  /**
   * Vérifie si un message a été envoyé par l'utilisateur connecté
   */
  isMyMessage(message: Message, currentUserId: string): boolean {
    return message.authorId === currentUserId;
  },

  /**
   * Obtient le nom d'affichage de l'auteur du message
   */
  getAuthorDisplayName(message: Message): string {
    if (message.author.displayName) {
      return message.author.displayName;
    }
    return `${message.author.firstName} ${message.author.lastName}`.trim() || message.author.username;
  },

  /**
   * Vérifie si deux messages peuvent être groupés (même auteur, temps proche)
   */
  canGroupWithPrevious(currentMessage: Message, previousMessage: Message | null): boolean {
    if (!previousMessage) return false;
    
    const isSameAuthor = currentMessage.authorId === previousMessage.authorId;
    const currentTime = new Date(currentMessage.createdAt).getTime();
    const previousTime = new Date(previousMessage.createdAt).getTime();
    const timeDiff = currentTime - previousTime;
    const fiveMinutes = 5 * 60 * 1000; // 5 minutes en millisecondes
    
    return isSameAuthor && timeDiff < fiveMinutes;
  },

  /**
   * Tronque le contenu d'un message pour l'aperçu
   */
  truncateContent(content: string, maxLength: number = 100): string {
    if (content.length <= maxLength) {
      return content;
    }
    return content.substring(0, maxLength - 3) + '...';
  },

  /**
   * Vérifie si le message contient des mentions (@username)
   */
  hasMentions(content: string): boolean {
    return /@\w+/.test(content);
  },

  /**
   * Extrait les mentions d'un message
   */
  extractMentions(content: string): string[] {
    const mentions = content.match(/@(\w+)/g);
    return mentions ? mentions.map(mention => mention.substring(1)) : [];
  },
};

export default messagesService;
