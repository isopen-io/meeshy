import { apiService } from './api.service';
import type { ApiResponse } from '@meeshy/shared/types';
import type { AdminUser } from '@meeshy/shared/types';

export interface AdminStats {
  // 1. Utilisateurs
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  adminUsers: number;
  // 2. Utilisateurs anonymes
  totalAnonymousUsers: number;
  activeAnonymousUsers: number;
  inactiveAnonymousUsers: number;
  // 3. Messages
  totalMessages: number;
  // 4. Communautés
  totalCommunities: number;
  // 5. Traductions
  totalTranslations: number;
  // 6. Liens créés pour conversations
  totalShareLinks: number;
  activeShareLinks: number;
  // 7. Signalements
  totalReports: number;
  // 8. Invitations à rejoindre communauté
  totalInvitations: number;
  // 9. Langues les plus utilisées
  topLanguages: Array<{
    language: string;
    count: number;
  }>;
  // Métadonnées supplémentaires
  usersByRole: Record<string, number>;
  messagesByType: Record<string, number>;
}

export interface RecentActivity {
  newUsers: number;
  newConversations: number;
  newMessages: number;
  newAnonymousUsers: number;
}

export interface AdminDashboardData {
  statistics: AdminStats;
  recentActivity: RecentActivity;
  userPermissions: any;
  timestamp: string;
}

// Réexportation du type AdminUser depuis @shared pour usage dans ce module
export type User = AdminUser;

export interface PaginationParams {
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface AdminUsersResponse {
  users: User[];
  pagination: PaginationParams;
}

export interface AnonymousUser {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email?: string;
  sessionToken: string;
  ipAddress?: string;
  country?: string;
  language: string;
  isActive: boolean;
  isOnline: boolean;
  lastActiveAt: Date;
  joinedAt: Date;
  leftAt?: Date;
  canSendMessages: boolean;
  canSendFiles: boolean;
  canSendImages: boolean;
  shareLink: {
    id: string;
    linkId: string;
    identifier?: string;
    name?: string;
    conversation: {
      id: string;
      identifier?: string;
      title?: string;
    };
  };
  _count: {
    sentMessages: number;
  };
}

export interface AdminAnonymousUsersResponse {
  anonymousUsers: AnonymousUser[];
  pagination: PaginationParams;
}

/**
 * Service pour gérer l'administration
 */
export const adminService = {
  /**
   * Récupère les statistiques du tableau de bord administrateur
   */
  async getDashboardStats(): Promise<ApiResponse<AdminDashboardData>> {
    try {
      const response = await apiService.get<AdminDashboardData>('/admin/dashboard');
      return response;
    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques admin:', error);
      throw error;
    }
  },

  /**
   * Récupère la liste des utilisateurs avec pagination
   * @param offset - Number of items to skip
   * @param limit - Number of items to return
   */
  async getUsers(offset: number = 0, limit: number = 20, search?: string, role?: string, status?: string): Promise<ApiResponse<AdminUsersResponse>> {
    try {
      const params: any = { offset, limit };
      if (search) {
        params.search = search;
      }
      if (role) {
        params.role = role;
      }
      if (status) {
        params.status = status;
      }
      const response = await apiService.get<AdminUsersResponse>('/admin/users', params);
      return response;
    } catch (error) {
      console.error('Erreur lors de la récupération des utilisateurs:', error);
      throw error;
    }
  },

  /**
   * Met à jour le rôle d'un utilisateur
   */
  async updateUserRole(userId: string, role: string): Promise<ApiResponse<User>> {
    try {
      const response = await apiService.patch<User>(`/admin/users/${userId}/role`, { role });
      return response;
    } catch (error) {
      console.error('Erreur lors de la mise à jour du rôle:', error);
      throw error;
    }
  },

  /**
   * Active/désactive un utilisateur
   */
  async toggleUserStatus(userId: string, isActive: boolean): Promise<ApiResponse<User>> {
    try {
      const response = await apiService.patch<User>(`/admin/users/${userId}/status`, { isActive });
      return response;
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error);
      throw error;
    }
  },

  /**
   * Supprime un utilisateur
   */
  async deleteUser(userId: string): Promise<ApiResponse<void>> {
    try {
      const response = await apiService.delete<void>(`/admin/users/${userId}`);
      return response;
    } catch (error) {
      console.error('Erreur lors de la suppression de l\'utilisateur:', error);
      throw error;
    }
  },

  /**
   * Récupère la liste des utilisateurs anonymes avec pagination
   * @param offset - Number of items to skip
   * @param limit - Number of items to return
   */
  async getAnonymousUsers(offset: number = 0, limit: number = 20, search?: string, status?: string): Promise<ApiResponse<AdminAnonymousUsersResponse>> {
    try {
      const params: any = { offset, limit };
      if (search) {
        params.search = search;
      }
      if (status) {
        params.status = status;
      }
      const response = await apiService.get<AdminAnonymousUsersResponse>('/admin/anonymous-users', params);
      return response;
    } catch (error) {
      console.error('Erreur lors de la récupération des utilisateurs anonymes:', error);
      throw error;
    }
  },

  /**
   * Récupère la liste des messages avec pagination
   * @param offset - Number of items to skip
   * @param limit - Number of items to return
   */
  async getMessages(offset: number = 0, limit: number = 20, search?: string, type?: string, period?: string): Promise<ApiResponse<any>> {
    try {
      const params: any = { offset, limit };
      if (search) {
        params.search = search;
      }
      if (type) {
        params.type = type;
      }
      if (period) {
        params.period = period;
      }
      const response = await apiService.get<any>('/admin/messages', params);
      return response;
    } catch (error) {
      console.error('Erreur lors de la récupération des messages:', error);
      throw error;
    }
  },

  /**
   * Récupère la liste des communautés avec pagination
   * @param offset - Number of items to skip
   * @param limit - Number of items to return
   */
  async getCommunities(offset: number = 0, limit: number = 20, search?: string, isPrivate?: boolean): Promise<ApiResponse<any>> {
    try {
      const params: any = { offset, limit };
      if (search) {
        params.search = search;
      }
      if (isPrivate !== undefined) {
        params.isPrivate = isPrivate.toString();
      }
      const response = await apiService.get<any>('/admin/communities', params);
      return response;
    } catch (error) {
      console.error('Erreur lors de la récupération des communautés:', error);
      throw error;
    }
  },

  /**
   * Récupère la liste des traductions avec pagination
   * @param offset - Number of items to skip
   * @param limit - Number of items to return
   */
  async getTranslations(offset: number = 0, limit: number = 20, sourceLanguage?: string, targetLanguage?: string, period?: string): Promise<ApiResponse<any>> {
    try {
      const params: any = { offset, limit };
      if (sourceLanguage) {
        params.sourceLanguage = sourceLanguage;
      }
      if (targetLanguage) {
        params.targetLanguage = targetLanguage;
      }
      if (period) {
        params.period = period;
      }
      const response = await apiService.get<any>('/admin/translations', params);
      return response;
    } catch (error) {
      console.error('Erreur lors de la récupération des traductions:', error);
      throw error;
    }
  },

  /**
   * Récupère la liste des liens de partage avec pagination
   * @param offset - Number of items to skip
   * @param limit - Number of items to return
   */
  async getShareLinks(offset: number = 0, limit: number = 20, search?: string, isActive?: boolean): Promise<ApiResponse<any>> {
    try {
      const params: any = { offset, limit };
      if (search) {
        params.search = search;
      }
      if (isActive !== undefined) {
        params.isActive = isActive.toString();
      }
      const response = await apiService.get<any>('/admin/share-links', params);
      return response;
    } catch (error) {
      console.error('Erreur lors de la récupération des liens de partage:', error);
      throw error;
    }
  },

  /**
   * Récupère les classements selon différents critères
   */
  async getRankings(entityType: string, criterion: string, period: string, limit: number = 50): Promise<ApiResponse<any>> {
    try {
      const params = {
        entityType,
        criterion,
        period,
        limit: limit.toString()
      };
      const response = await apiService.get<any>('/admin/ranking', params);
      return response;
    } catch (error) {
      console.error('Erreur lors de la récupération des classements:', error);
      throw error;
    }
  },

  // ===== BROADCASTS =====

  async getBroadcasts(offset: number = 0, limit: number = 20, status?: string): Promise<ApiResponse<any>> {
    try {
      const params: any = { offset, limit };
      if (status) params.status = status;
      return await apiService.get<any>('/admin/broadcasts', params);
    } catch (error) {
      console.error('Erreur lors de la récupération des broadcasts:', error);
      throw error;
    }
  },

  async getBroadcast(id: string): Promise<ApiResponse<any>> {
    try {
      return await apiService.get<any>(`/admin/broadcasts/${id}`);
    } catch (error) {
      console.error('Erreur lors de la récupération du broadcast:', error);
      throw error;
    }
  },

  async createBroadcast(data: { name: string; subject: string; body: string; sourceLanguage: string; targeting: any }): Promise<ApiResponse<any>> {
    try {
      return await apiService.post<any>('/admin/broadcasts', data);
    } catch (error) {
      console.error('Erreur lors de la création du broadcast:', error);
      throw error;
    }
  },

  async updateBroadcast(id: string, data: any): Promise<ApiResponse<any>> {
    try {
      return await apiService.put<any>(`/admin/broadcasts/${id}`, data);
    } catch (error) {
      console.error('Erreur lors de la mise à jour du broadcast:', error);
      throw error;
    }
  },

  async previewBroadcast(id: string): Promise<ApiResponse<any>> {
    try {
      return await apiService.post<any>(`/admin/broadcasts/${id}/preview`, {});
    } catch (error) {
      console.error('Erreur lors de la prévisualisation du broadcast:', error);
      throw error;
    }
  },

  async sendBroadcast(id: string): Promise<ApiResponse<any>> {
    try {
      return await apiService.post<any>(`/admin/broadcasts/${id}/send`, {});
    } catch (error) {
      console.error('Erreur lors de l\'envoi du broadcast:', error);
      throw error;
    }
  },

  async deleteBroadcast(id: string): Promise<ApiResponse<any>> {
    try {
      return await apiService.delete<any>(`/admin/broadcasts/${id}`);
    } catch (error) {
      console.error('Erreur lors de la suppression du broadcast:', error);
      throw error;
    }
  },
};
