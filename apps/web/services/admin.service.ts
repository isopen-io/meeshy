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

export interface AdminUsersResponse {
  users: User[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
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
  lastSeenAt: Date;
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
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
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
   */
  async getUsers(page: number = 1, limit: number = 20, search?: string, role?: string, status?: string): Promise<ApiResponse<AdminUsersResponse>> {
    try {
      const params: any = { page, limit };
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
   */
  async getAnonymousUsers(page: number = 1, limit: number = 20, search?: string, status?: string): Promise<ApiResponse<AdminAnonymousUsersResponse>> {
    try {
      const params: any = { page, limit };
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
   */
  async getMessages(page: number = 1, limit: number = 20, search?: string, type?: string, period?: string): Promise<ApiResponse<any>> {
    try {
      const params: any = { page, limit };
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
   */
  async getCommunities(page: number = 1, limit: number = 20, search?: string, isPrivate?: boolean): Promise<ApiResponse<any>> {
    try {
      const params: any = { page, limit };
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
   */
  async getTranslations(page: number = 1, limit: number = 20, sourceLanguage?: string, targetLanguage?: string, period?: string): Promise<ApiResponse<any>> {
    try {
      const params: any = { page, limit };
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
   */
  async getShareLinks(page: number = 1, limit: number = 20, search?: string, isActive?: boolean): Promise<ApiResponse<any>> {
    try {
      const params: any = { page, limit };
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
  }
};
