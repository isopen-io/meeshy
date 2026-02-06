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

interface PaginatedParticipantsResponse {
  success: boolean;
  data: Array<User & {
    isAnonymous?: boolean;
    canSendMessages?: boolean;
    canSendFiles?: boolean;
    canSendImages?: boolean;
  }>;
  pagination?: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

/**
 * Service pour les opérations sur les participants
 */
export class ParticipantsService {
  /**
   * Obtenir les participants d'une conversation avec pagination
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

      if (filters?.cursor) {
        params.cursor = filters.cursor;
      }

      const cacheKey = `${conversationId}-${JSON.stringify(params)}`;
      const cached = cacheService.getParticipantsFromCache(cacheKey);
      if (cached) {
        return cached;
      }

      const response = await apiService.get<PaginatedParticipantsResponse>(
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
   * Rechercher des participants dans une conversation (appel backend)
   */
  async searchParticipants(
    conversationId: string,
    searchQuery: string,
    limit: number = 50
  ): Promise<User[]> {
    try {
      if (!searchQuery.trim()) {
        return [];
      }

      const response = await apiService.get<PaginatedParticipantsResponse>(
        `/conversations/${conversationId}/participants`,
        {
          search: searchQuery.trim(),
          limit: limit.toString()
        }
      );

      return response.data?.data ?? [];
    } catch (error) {
      console.error('[ParticipantsService] Erreur lors de la recherche des participants:', error);
      return [];
    }
  }

  /**
   * Obtenir tous les participants (authentifiés et anonymes) avec pagination complète
   */
  async getAllParticipants(conversationId: string): Promise<AllParticipantsResponse> {
    try {
      const allParticipants: Array<User & {
        isAnonymous?: boolean;
        canSendMessages?: boolean;
        canSendFiles?: boolean;
        canSendImages?: boolean;
      }> = [];

      let cursor: string | null = null;
      let hasMore = true;

      // Charger tous les participants avec pagination
      while (hasMore) {
        const params: Record<string, string> = { limit: '100' };
        if (cursor) {
          params.cursor = cursor;
        }

        const response = await apiService.get<PaginatedParticipantsResponse>(
          `/conversations/${conversationId}/participants`,
          params
        );

        const pageParticipants = response.data?.data ?? [];
        allParticipants.push(...pageParticipants);

        // Vérifier s'il y a plus de pages
        hasMore = response.data?.pagination?.hasMore ?? false;
        cursor = response.data?.pagination?.nextCursor ?? null;

        // Sécurité: arrêter après 10 pages max (1000 participants)
        if (allParticipants.length >= 1000) {
          console.warn('[ParticipantsService] Limite de 1000 participants atteinte');
          break;
        }
      }

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
