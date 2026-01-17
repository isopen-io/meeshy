/**
 * Service de traduction de messages pour Meeshy
 * Gère les demandes de traduction forcée via l'API Gateway
 */

import axios from 'axios';
import { buildApiUrl } from '@/lib/config';
import { authManager } from './auth-manager.service';
import type { TranslationModel } from '@meeshy/shared/types';

// === TYPES ET INTERFACES ===
export interface ForceTranslationRequest {
  messageId: string;
  targetLanguage: string;
  sourceLanguage?: string; // Langue source du message original
  model?: TranslationModel;
}

export interface ForceTranslationResponse {
  messageId: string;
  targetLanguage: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  translationId?: string;
  estimatedTime?: number;
}

export interface MessageTranslationStatus {
  messageId: string;
  targetLanguage: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  translatedContent?: string;
  error?: string;
}

// === CONFIGURATION ===
const TIMEOUT = 30000; // 30 secondes

// === SERVICE DE TRADUCTION DE MESSAGES ===
class MessageTranslationService {
  /**
   * Demande une traduction forcée d'un message vers une langue spécifique
   */
  async requestTranslation(request: ForceTranslationRequest): Promise<ForceTranslationResponse> {
    try {
      // Gérer l'authentification selon le mode (authentifié ou anonyme)
      const authToken = authManager.getAuthToken();
      const sessionToken = authManager.getAnonymousSession()?.token;
      
      if (!authToken && !sessionToken) {
        throw new Error('Aucun token d\'authentification disponible (ni auth_token ni session_token)');
      }

      // Utiliser l'API /translate avec message_id pour traduire un message existant
      const requestBody: any = {
        message_id: request.messageId,
        target_language: request.targetLanguage,
        model_type: request.model || 'basic'
      };

      // Ajouter la langue source si fournie
      if (request.sourceLanguage) {
        requestBody.source_language = request.sourceLanguage;
      }

      // Préparer les headers selon le type d'authentification
      const headers: any = {
        'Content-Type': 'application/json'
      };

      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      } else if (sessionToken) {
        headers['X-Session-Token'] = sessionToken;
      }

      const response = await axios.post(buildApiUrl('/translate'), requestBody, {
        timeout: TIMEOUT,
        headers
      });

      return {
        messageId: request.messageId,
        targetLanguage: request.targetLanguage,
        status: response.data.success ? 'completed' : 'failed',
        translationId: response.data.translationId,
        estimatedTime: response.data.estimatedTime
      };
    } catch (error: any) {
      console.error('Erreur lors de la demande de traduction:', error);
      throw new Error(`Impossible de demander la traduction: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Vérifie le statut d'une traduction en cours
   */
  async getTranslationStatus(messageId: string, targetLanguage: string): Promise<MessageTranslationStatus> {
    try {
      const response = await axios.get(`${buildApiUrl('/messages')}/${messageId}/translate/${targetLanguage}/status`, {
        timeout: 10000
      });

      return {
        messageId,
        targetLanguage,
        status: response.data.status,
        progress: response.data.progress,
        translatedContent: response.data.translatedContent,
        error: response.data.error
      };
    } catch (error: any) {
      console.error('Erreur lors de la vérification du statut:', error);
      return {
        messageId,
        targetLanguage,
        status: 'failed',
        error: 'Impossible de vérifier le statut'
      };
    }
  }

  /**
   * Annule une traduction en cours
   */
  async cancelTranslation(messageId: string, targetLanguage: string): Promise<boolean> {
    try {
      await axios.delete(`${buildApiUrl('/messages')}/${messageId}/translate/${targetLanguage}`, {
        timeout: 10000
      });
      return true;
    } catch (error: any) {
      console.error('Erreur lors de l\'annulation:', error);
      return false;
    }
  }

  /**
   * Obtient toutes les traductions disponibles pour un message
   */
  async getMessageTranslations(messageId: string): Promise<MessageTranslationStatus[]> {
    try {
      const response = await axios.get(`${buildApiUrl('/messages')}/${messageId}/translations`, {
        timeout: 10000
      });

      return response.data.translations || [];
    } catch (error: any) {
      console.error('Erreur lors de la récupération des traductions:', error);
      return [];
    }
  }
}

// Instance singleton
export const messageTranslationService = new MessageTranslationService();

// Export par défaut
export default messageTranslationService;
