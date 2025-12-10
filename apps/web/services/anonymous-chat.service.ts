/**
 * Service pour la gestion des participants anonymes
 * Gère les connexions, messages et sessions pour les participants anonymes
 */

import { buildApiUrl } from '@/lib/config';
import { toast } from 'sonner';
import { authManager } from './auth-manager.service';

export interface AnonymousParticipant {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  language: string;
  canSendMessages: boolean;
  canSendFiles: boolean;
  canSendImages: boolean;
}

export interface AnonymousChatData {
  participant: AnonymousParticipant;
  conversation: {
    id: string;
    title: string;
    type: string;
    allowViewHistory: boolean;
  };
  linkId: string;
}

export class AnonymousChatService {
  private sessionToken: string | null = null;
  private linkId: string | null = null;

  constructor() {
    // Vérifier que le code s'exécute côté client
    if (typeof window !== 'undefined') {
      this.sessionToken = authManager.getAnonymousSession()?.token;
    }
  }

  /**
   * Initialise le service avec les données de session
   */
  public initialize(linkId: string): void {
    this.linkId = linkId;
    if (typeof window !== 'undefined') {
      this.sessionToken = authManager.getAnonymousSession()?.token;
    }
  }

  /**
   * Rafraîchit la session anonyme
   */
  public async refreshSession(): Promise<AnonymousChatData | null> {
    if (!this.sessionToken) {
      throw new Error('Aucune session anonyme trouvée');
    }

    try {
      const response = await fetch(buildApiUrl('/anonymous/refresh'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sessionToken: this.sessionToken })
      });

      if (!response.ok) {
        throw new Error('Session invalide');
      }

      const result = await response.json();
      
      if (result.success) {
        return result.data;
      } else {
        throw new Error(result.message || 'Erreur lors du rafraîchissement de la session');
      }
    } catch (error) {
      console.error('Erreur rafraîchissement session anonyme:', error);
      throw error;
    }
  }

  /**
   * Charge les messages de la conversation
   */
  public async loadMessages(limit: number = 50, offset: number = 0): Promise<any> {
    if (!this.sessionToken || !this.linkId) {
      throw new Error('Session non initialisée');
    }

    try {
      const response = await fetch(
        buildApiUrl(`/api/links/${this.linkId}/messages?limit=${limit}&offset=${offset}`),
        {
          method: 'GET',
          headers: {
            'X-Session-Token': this.sessionToken
          }
        }
      );

      if (!response.ok) {
        throw new Error('Erreur lors du chargement des messages');
      }

      const result = await response.json();
      
      if (result.success) {
        return result.data;
      } else {
        throw new Error(result.message || 'Erreur lors du chargement des messages');
      }
    } catch (error) {
      console.error('Erreur chargement messages anonymes:', error);
      throw error;
    }
  }

  /**
   * Envoie un message
   */
  public async sendMessage(content: string, originalLanguage: string = 'fr', replyToId?: string): Promise<any> {
    if (!this.sessionToken || !this.linkId) {
      throw new Error('Session non initialisée');
    }

    try {
      const response = await fetch(buildApiUrl(`/api/links/${this.linkId}/messages`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': this.sessionToken
        },
        body: JSON.stringify({
          content,
          originalLanguage,
          messageType: 'text',
          ...(replyToId && { replyToId })
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erreur lors de l\'envoi du message');
      }

      const result = await response.json();
      
      if (result.success) {
        return result.data;
      } else {
        throw new Error(result.message || 'Erreur lors de l\'envoi du message');
      }
    } catch (error) {
      console.error('Erreur envoi message anonyme:', error);
      throw error;
    }
  }

  /**
   * Quitte la session anonyme
   */
  public async leaveSession(): Promise<void> {
    if (!this.sessionToken) {
      return;
    }

    try {
      await fetch(buildApiUrl('/anonymous/leave'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sessionToken: this.sessionToken })
      });
    } catch (error) {
      console.error('Erreur lors de la fermeture de session:', error);
    } finally {
      // Nettoyer le localStorage
      if (typeof window !== 'undefined') {
        authManager.clearAnonymousSessions();
        localStorage.removeItem('anonymous_participant');
      }
      this.sessionToken = null;
      this.linkId = null;
    }
  }

  /**
   * Vérifie si une session anonyme est active
   */
  public hasActiveSession(): boolean {
    return !!this.sessionToken;
  }

  /**
   * Obtient le token de session
   */
  public getSessionToken(): string | null {
    return this.sessionToken;
  }
}

// Instance singleton
export const anonymousChatService = new AnonymousChatService();
