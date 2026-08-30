import { logger } from '@/utils/logger';
/**
 * Service pour la gestion des participants anonymes
 * Gère les connexions, messages et sessions pour les participants anonymes
 */

import { buildApiUrl } from '@/lib/config';
import { API_ENDPOINTS } from '@meeshy/shared/api/endpoints';
import { toast } from 'sonner';
import { authManager } from './auth-manager.service';
import { generateClientMessageId } from '@/utils/client-message-id';
import type { Participant } from '@meeshy/shared/types/participant';
import type { Message } from '@meeshy/shared/types';
import type { LinkMessageSendResponseData } from '@meeshy/shared/types/socketio-events';

export interface AnonymousChatData {
  participant: Participant;
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
      this.sessionToken = authManager.getAnonymousSession()?.token ?? null;
    }
  }

  /**
   * Initialise le service avec les données de session
   */
  public initialize(linkId: string): void {
    this.linkId = linkId;
    if (typeof window !== 'undefined') {
      this.sessionToken = authManager.getAnonymousSession()?.token ?? null;
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
      const response = await fetch(buildApiUrl(API_ENDPOINTS.anonymous.refresh), {
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
      logger.error('[Service]', 'Erreur rafraîchissement session anonyme', { error });
      throw error;
    }
  }

  /**
   * Charge les messages de la conversation
   */
  public async loadMessages(limit: number = 50, offset: number = 0): Promise<{ messages: Message[]; hasMore: boolean; total: number }> {
    if (!this.sessionToken || !this.linkId) {
      throw new Error('Session non initialisée');
    }

    try {
      const messagesEndpoint = `${API_ENDPOINTS.links.byIdentifierMessages(this.linkId)}?limit=${limit}&offset=${offset}`;
      const response = await fetch(
        buildApiUrl(messagesEndpoint),
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
      logger.error('[Service]', 'Erreur chargement messages anonymes', { error });
      throw error;
    }
  }

  /**
   * Envoie un message par la route de lien de partage.
   *
   * Le type de retour décrit ce que la route rend RÉELLEMENT :
   * `{ messageId, message }`, pas un `Message`. La signature annonçait
   * `Promise<Message>`, et l'unique appelant compensait par un double cast qui
   * lisait les deux formes à l'aveugle. Le type mentait ; le cast le cachait.
   *
   * `clientMessageId` vient de l'APPELANT quand il en a déjà un : c'est la clé
   * qui relie la réponse serveur à sa ligne optimiste. En forger un ici rendrait
   * la réconciliation impossible — le message s'afficherait deux fois.
   */
  public async sendMessage(params: {
    content: string;
    originalLanguage?: string;
    replyToId?: string;
    clientMessageId?: string;
  }): Promise<LinkMessageSendResponseData> {
    if (!this.sessionToken || !this.linkId) {
      throw new Error('Session non initialisée');
    }

    const { content, originalLanguage = 'fr', replyToId, clientMessageId } = params;

    try {
      const response = await fetch(buildApiUrl(API_ENDPOINTS.links.byIdentifierMessages(this.linkId)), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': this.sessionToken
        },
        body: JSON.stringify({
          content,
          originalLanguage,
          messageType: 'text',
          clientMessageId: clientMessageId ?? generateClientMessageId(),
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
      logger.error('[Service]', 'Erreur envoi message anonyme', { error });
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
      await fetch(buildApiUrl(API_ENDPOINTS.anonymous.leave), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sessionToken: this.sessionToken })
      });
    } catch (error) {
      logger.error('[Service]', 'Erreur lors de la fermeture de session', { error });
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
   * Ce service est-il en mesure d'envoyer MAINTENANT par la route de lien ?
   *
   * Prédicat unique : c'est ce service qui détient les deux éléments requis
   * (le jeton de session et le lien), donc c'est lui qui répond. Un appelant
   * qui recomposerait la réponse à partir de `authManager` et d'un `linkId`
   * glané ailleurs dupliquerait la règle et divergerait au premier changement.
   */
  public canSendViaLink(): boolean {
    return !!this.sessionToken && !!this.linkId;
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
