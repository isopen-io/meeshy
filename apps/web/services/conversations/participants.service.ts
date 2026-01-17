/**
 * Service de gestion des participants
 * Responsabilité: Opérations sur les participants (récupération, ajout, suppression, rôles)
 */

import { apiService } from '../api.service';
import { cacheService } from './cache.service';
import type { User } from '@meeshy/shared/types';
import type {
  ParticipantsFilters,
  AllParticipantsResponse,
} from './types';

/**
 * Service pour les opérations sur les participants
 */
export class ParticipantsService {
  /**
   * Obtenir les participants d'une conversation
   */
  async getParticipants(
    conversationId: string,
    filters?: ParticipantsFilters
  ): Promise<User[]> {
    try {
      const params: Record<string, string> = {};

      if (filters?.onlineOnly) {
        params.onlineOnly = 'true';
      }

      if (filters?.role) {
        params.role = filters.role;
      }

      if (filters?.search) {
        params.search = filters.search;
      }

      if (filters?.limit) {
        params.limit = filters.limit.toString();
      }

      const cacheKey = `${conversationId}-${JSON.stringify(params)}`;
      const cached = cacheService.getParticipantsFromCache(cacheKey);
      if (cached) {
        return cached;
      }

      const response = await apiService.get<{ success: boolean; data: User[] }>(
        `/conversations/${conversationId}/participants`,
        params
      );

      const participants = response.data?.data ?? [];

      cacheService.setParticipantsCache(cacheKey, participants);

      return participants;
    } catch (error) {
      console.error('[ParticipantsService] Erreur lors de la récupération des participants:', error);
      return [];
    }
  }

  /**
   * Obtenir tous les participants (authentifiés et anonymes)
   */
  async getAllParticipants(conversationId: string): Promise<AllParticipantsResponse> {
    try {
      const response = await apiService.get<{
        success: boolean;
        data: Array<User & {
          isAnonymous?: boolean;
          canSendMessages?: boolean;
          canSendFiles?: boolean;
          canSendImages?: boolean;
        }>;
      }>(`/conversations/${conversationId}/participants`);

      const allParticipants = response.data?.data ?? [];

      const authenticatedParticipants: User[] = [];
      const anonymousParticipants: Array<{
        id: string;
        username: string;
        firstName: string;
        lastName: string;
        language: string;
        isOnline: boolean;
        joinedAt: string;
        canSendMessages: boolean;
        canSendFiles: boolean;
        canSendImages: boolean;
      }> = [];

      allParticipants.forEach((participant) => {
        if (participant.isAnonymous) {
          anonymousParticipants.push({
            id: participant.id,
            username: participant.username,
            firstName: participant.firstName,
            lastName: participant.lastName,
            language: participant.systemLanguage || 'fr',
            isOnline: participant.isOnline,
            joinedAt: participant.createdAt ? new Date(participant.createdAt).toISOString() : new Date().toISOString(),
            canSendMessages: participant.canSendMessages || false,
            canSendFiles: participant.canSendFiles || false,
            canSendImages: participant.canSendImages || false
          });
        } else {
          authenticatedParticipants.push(participant);
        }
      });

      return {
        authenticatedParticipants,
        anonymousParticipants
      };
    } catch (error) {
      console.error('Erreur lors de la récupération de tous les participants:', error);
      return {
        authenticatedParticipants: [],
        anonymousParticipants: []
      };
    }
  }

  /**
   * Ajouter un participant à une conversation
   */
  async addParticipant(conversationId: string, userId: string): Promise<void> {
    await apiService.post(`/conversations/${conversationId}/participants`, { userId });

    // Invalider le cache des participants
    cacheService.invalidateParticipantsCache();
  }

  /**
   * Supprimer un participant d'une conversation
   */
  async removeParticipant(conversationId: string, userId: string): Promise<void> {
    await apiService.delete(`/conversations/${conversationId}/participants/${userId}`);

    // Invalider le cache des participants
    cacheService.invalidateParticipantsCache();
  }

  /**
   * Mettre à jour le rôle d'un participant
   */
  async updateParticipantRole(
    conversationId: string,
    userId: string,
    role: 'ADMIN' | 'MODERATOR' | 'MEMBER'
  ): Promise<void> {
    await apiService.patch(`/conversations/${conversationId}/participants/${userId}/role`, { role });

    // Invalider le cache des participants
    cacheService.invalidateParticipantsCache();
  }
}

export const participantsService = new ParticipantsService();
