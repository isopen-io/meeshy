import { logger } from '@/utils/logger';
import { apiService } from './api.service';
import type { ApiResponse } from '@meeshy/shared/types';
import type { User, Conversation } from '@/types';

export interface DashboardStats {
  totalConversations: number;
  totalCommunities: number;
  totalMessages: number;
  activeConversations: number;
  translationsToday: number;
  totalLinks: number;
  lastUpdated: Date;
}

export interface DashboardCommunity {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  isPrivate?: boolean;
  updatedAt?: string;
  members: Array<{
    id: string;
    username: string;
    displayName?: string;
    avatar?: string;
  }>;
  memberCount: number;
  conversationCount?: number;
}

export interface DashboardData {
  stats: DashboardStats;
  recentConversations: Conversation[];
  recentCommunities: DashboardCommunity[];
}

/**
 * Service pour gérer les données du dashboard utilisateur
 */
export const dashboardService = {
  /**
   * Récupère les statistiques et données du dashboard pour l'utilisateur connecté
   */
  async getDashboardData(): Promise<ApiResponse<DashboardData>> {
    try {
      const response = await apiService.get<{ success: boolean; data: any }>('/users/me/dashboard-stats');
      
      // Transformation des données pour assurer la compatibilité
      const data = response.data!.data;
      
      // Si le backend retourne encore totalGroups, le convertir en totalCommunities
      if (data.stats && data.stats.totalGroups !== undefined && data.stats.totalCommunities === undefined) {
        data.stats.totalCommunities = data.stats.totalGroups;
        delete data.stats.totalGroups;
      }
      
      // Si le backend retourne encore recentGroups, le convertir en recentCommunities
      if (data.recentGroups && !data.recentCommunities) {
        data.recentCommunities = data.recentGroups;
        delete data.recentGroups;
      }
      
      return {
        success: true,
        data: data as DashboardData,
        message: response.message
      };
    } catch (error) {
      logger.error('[Service]', 'Erreur lors de la récupération des données du dashboard', { error });
      throw error;
    }
  }

  // #5299 — `getShareLinks`/`createShareLink`/`deactivateShareLink`/
  // `getShareLinkInfo`/`joinViaShareLink` ont été retirées : les cinq
  // ciblaient un espace `/share-links/*` qui n'a jamais existé côté
  // passerelle (seul `/share-links` ADMIN existe, pour `admin.service.ts`,
  // sans rapport avec ce service). Zéro appelant dans tout le dépôt web en
  // dehors de leur propre test, qui ne faisait que rejouer le mock —
  // `apiService` étant entièrement doublé, aucun des cinq témoins ne pouvait
  // jamais tomber sur une route absente. La fonctionnalité réelle (créer,
  // activer/désactiver, rejoindre un lien) est déjà servie ailleurs, contre
  // les VRAIES routes : `app/links/page.tsx` (`PATCH /links/:linkId`) et
  // `admin.service.ts`/`app/admin/share-links/page.tsx` (`/share-links`
  // admin). Retirer plutôt que corriger une redirection : republier un
  // adaptateur vers `POST /links/:key/members` sans un seul appelant réel
  // aurait fabriqué un contrat que rien ne peut vérifier depuis le produit.
};

export default dashboardService;
