/**
 * Service de gestion des participants
 * Responsabilité: Opérations sur les participants (récupération, ajout, suppression, rôles)
 */

import type { MemberRoleType } from '@meeshy/shared/types/role-types';
import { apiService } from '../api.service';
import type {
  ParticipantsFilters,
  AllParticipantsResponse,
  ConversationParticipantResponse,
} from './types';

interface PaginatedParticipantsResponse {
  success: boolean;
  data: ConversationParticipantResponse[];
  pagination?: {
    nextCursor: string | null;
    hasMore: boolean;
    totalCount?: number;
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
  ): Promise<ConversationParticipantResponse[]> {
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

      const response = await apiService.get<PaginatedParticipantsResponse>(
        `/conversations/${conversationId}/participants`,
        params
      );

      return response.data?.data ?? [];
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
  ): Promise<ConversationParticipantResponse[]> {
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
      const allParticipants: ConversationParticipantResponse[] = [];

      let cursor: string | null = null;
      let hasMore = true;
      let totalCount: number | undefined;

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

        // Capture totalCount from first response
        if (totalCount === undefined && response.data?.pagination?.totalCount !== undefined) {
          totalCount = response.data.pagination.totalCount;
        }

        // Vérifier s'il y a plus de pages
        hasMore = response.data?.pagination?.hasMore ?? false;
        cursor = response.data?.pagination?.nextCursor ?? null;

        // Sécurité: arrêter après 10 pages max (1000 participants)
        if (allParticipants.length >= 1000) {
          console.warn('[ParticipantsService] Limite de 1000 participants atteinte');
          break;
        }
      }

      const authenticatedParticipants: ConversationParticipantResponse[] = [];
      const anonymousParticipants: ConversationParticipantResponse[] = [];

      allParticipants.forEach((participant) => {
        if (participant.isAnonymous) {
          anonymousParticipants.push(participant);
        } else {
          authenticatedParticipants.push(participant);
        }
      });

      return {
        authenticatedParticipants,
        anonymousParticipants,
        totalCount
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

  }

  /**
   * Supprimer un participant d'une conversation
   */
  async removeParticipant(conversationId: string, userId: string): Promise<void> {
    await apiService.delete(`/conversations/${conversationId}/participants/${userId}`);

  }

  /**
   * Mettre à jour le rôle d'un participant
   */
  async updateParticipantRole(
    conversationId: string,
    userId: string,
    role: MemberRoleType,
  ): Promise<void> {
    await apiService.patch(`/conversations/${conversationId}/participants/${userId}/role`, { role: role.toLowerCase() });

  }
}

export const participantsService = new ParticipantsService();
