/**
 * Service pour la gestion des messages
 * Gère l'édition et la suppression des messages
 */

import { buildApiUrl } from '@/lib/config';
import { authManager } from './auth-manager.service';

export interface EditMessageRequest {
  content: string;
  originalLanguage?: string;
}

export interface MessageResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export class MessageService {
  /**
   * Modifier un message
   */
  async editMessage(
    conversationId: string,
    messageId: string,
    request: EditMessageRequest
  ): Promise<MessageResponse> {
    try {
      const token = authManager.getAuthToken();
      if (!token) {
        throw new Error('Token d\'authentification manquant');
      }

      const response = await fetch(
        buildApiUrl(`/conversations/${conversationId}/messages/${messageId}`),
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(request)
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la modification du message');
      }

      return data;
    } catch (error) {
      console.error('Erreur lors de la modification du message:', error);
      throw error;
    }
  }

  /**
   * Supprimer un message
   */
  async deleteMessage(
    conversationId: string,
    messageId: string
  ): Promise<void> {
    try {
      const token = authManager.getAuthToken();
      if (!token) {
        throw new Error('Token d\'authentification manquant');
      }

      const response = await fetch(
        buildApiUrl(`/conversations/${conversationId}/messages/${messageId}`),
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la suppression du message');
      }

      return data;
    } catch (error) {
      console.error('Erreur lors de la suppression du message:', error);
      throw error;
    }
  }
}

export const messageService = new MessageService();
