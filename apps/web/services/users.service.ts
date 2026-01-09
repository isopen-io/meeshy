import { apiService } from './api.service';
import { User } from '@/types';
import { getDefaultPermissions } from '@/utils/user-adapter';
// Importer les types partagés pour cohérence
import type { ApiResponse, UpdateUserRequest, UpdateUserResponse } from '@meeshy/shared/types';

export interface UserStats {
  messagesSent: number;
  messagesReceived: number;
  conversationsCount: number;
  groupsCount: number;
  totalConversations: number;
  averageResponseTime?: number;
  lastActivity: Date;
}

// Utiliser le type partagé pour cohérence, avec extension pour l'avatar
export interface UpdateUserDto extends UpdateUserRequest {
  avatar?: string;
}

export interface SearchUsersResponse {
  users: User[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Service pour gérer les utilisateurs
 */
export const usersService = {
  /**
   * Récupère la liste de tous les utilisateurs
   */
  async getAllUsers(): Promise<ApiResponse<User[]>> {
    try {
      const response = await apiService.get<User[]>('/users');
      return response;
    } catch (error) {
      console.error('Erreur lors de la récupération des utilisateurs:', error);
      throw error;
    }
  },

  /**
   * Recherche des utilisateurs
   */
  async searchUsers(query: string): Promise<ApiResponse<User[]>> {
    console.log('[UsersService] searchUsers appelé avec query:', query);
    try {
      const url = `/users/search?q=${encodeURIComponent(query)}`;
      console.log('[UsersService] URL de recherche:', url);

      const response = await apiService.get<User[]>(url);
      console.log('[UsersService] ✅ Réponse API:', response);
      console.log('[UsersService] Nombre d\'utilisateurs trouvés:', Array.isArray(response.data) ? response.data.length : 'N/A');

      return response;
    } catch (error) {
      console.error('[UsersService] ❌ Erreur lors de la recherche d\'utilisateurs:', error);
      throw error;
    }
  },

  /**
   * Récupère mon profil
   */
  async getMyProfile(): Promise<ApiResponse<User>> {
    try {
      const response = await apiService.get<any>('/auth/me');

      // L'API retourne { success: true, data: { user: {...} } }
      // apiService.request() met la réponse JSON dans response.data
      // Donc response.data = { success: true, data: { user: {...} } }
      const userData = (response.data?.data?.user as User) || (response.data?.user as User) || (response.data as User);

      // S'assurer que les permissions sont définies
      if (userData && !userData.permissions) {
        userData.permissions = getDefaultPermissions(userData.role);
      }

      return {
        ...response,
        data: userData
      };
    } catch (error) {
      console.error('Erreur lors de la récupération du profil:', error);
      throw error;
    }
  },

  /**
   * Met à jour mon profil
   */
  async updateMyProfile(updateData: UpdateUserDto): Promise<ApiResponse<User>> {
    try {
      const response = await apiService.patch<User>('/users/me', updateData);
      return response;
    } catch (error) {
      console.error('Erreur lors de la mise à jour du profil:', error);
      throw error;
    }
  },

  /**
   * Récupère les statistiques du dashboard
   */
  async getDashboardStats(): Promise<ApiResponse<{
    stats: {
      totalConversations: number;
      totalCommunities: number;
      totalMessages: number;
      activeConversations: number;
      translationsToday: number;
      totalLinks: number;
      lastUpdated: Date;
    };
    recentConversations: any[];
    recentCommunities: any[];
  }>> {
    try {
      const response = await apiService.get('/users/me/dashboard-stats');
      return response;
    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques du dashboard:', error);
      throw error;
    }
  },

  /**
   * Récupère le profil d'un utilisateur
   */
  async getUserProfile(userId: string): Promise<ApiResponse<User>> {
    try {
      const response = await apiService.get<{ success: boolean; data: User }>(`/users/${userId}`);
      if (!response.data.success || !response.data.data) {
        throw new Error('User not found');
      }
      return {
        success: true,
        data: response.data.data,
        message: response.message
      };
    } catch (error) {
      console.error('Erreur lors de la récupération du profil utilisateur:', error);
      throw error;
    }
  },

  /**
   * Récupère les statistiques d'un utilisateur
   */
  async getUserStats(userId: string): Promise<ApiResponse<UserStats>> {
    try {
      const response = await apiService.get<{ success: boolean; data: UserStats }>(`/users/${userId}/stats`);
      if (!response.data.success || !response.data.data) {
        throw new Error('Stats not found');
      }
      return {
        success: true,
        data: response.data.data,
        message: response.message
      };
    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques utilisateur:', error);
      throw error;
    }
  },

  /**
   * Vérifie si un utilisateur est en ligne
   * Basé sur lastActiveAt pour refléter l'activité détectable
   * Un utilisateur est considéré en ligne s'il a été actif dans les 5 dernières minutes
   */
  isUserOnline(user: User): boolean {
    // Si le flag isOnline est false, l'utilisateur est définitivement hors ligne
    if (!user.isOnline) {
      return false;
    }

    const lastActive = new Date(user.lastActiveAt);
    const now = new Date();
    const diffMs = now.getTime() - lastActive.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    // Considérer en ligne si activité dans les 5 dernières minutes
    return diffMinutes < 5;
  },

  /**
   * Calcule le statut détaillé de l'utilisateur
   * Basé sur lastActiveAt
   * @returns 'online' | 'away' | 'offline'
   */
  getUserStatus(user: User): 'online' | 'away' | 'offline' {
    if (!user.isOnline) {
      return 'offline';
    }

    const lastActive = new Date(user.lastActiveAt);
    const now = new Date();
    const diffMs = now.getTime() - lastActive.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    // En ligne : activité < 5 minutes
    if (diffMinutes < 5) {
      return 'online';
    }

    // Absent/Inactif : 5 min < activité < 30 min
    if (diffMinutes < 30) {
      return 'away';
    }

    // Hors ligne : activité > 30 minutes
    return 'offline';
  },

  /**
   * Formate le nom d'affichage d'un utilisateur
   */
  getDisplayName(user: User): string {
    if (user.displayName) {
      return user.displayName;
    }
    return `${user.firstName} ${user.lastName}`.trim() || user.username;
  },

  /**
   * Formate la dernière connexion
   */
  getLastSeenFormatted(user: User): string {
    if (user.isOnline) {
      return 'En ligne';
    }

    const lastActive = new Date(user.lastActiveAt);
    const now = new Date();
    const diffMs = now.getTime() - lastActive.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) {
      return 'À l\'instant';
    } else if (diffMinutes < 60) {
      return `Il y a ${diffMinutes} min`;
    } else if (diffHours < 24) {
      return `Il y a ${diffHours}h`;
    } else if (diffDays < 7) {
      return `Il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
    } else {
      return lastActive.toLocaleDateString('fr-FR');
    }
  },

  /**
   * Obtient l'avatar par défaut pour un utilisateur
   */
  getDefaultAvatar(user: User): string {
    const initials = this.getDisplayName(user)
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
    
    // Couleur basée sur l'ID utilisateur pour cohérence
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-red-500',
      'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500'
    ];
    const colorIndex = user.id.charCodeAt(0) % colors.length;

    return `data:image/svg+xml,${encodeURIComponent(`
      <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
        <rect width="40" height="40" fill="#${colors[colorIndex].replace('bg-', '').replace('-500', '')}" rx="20"/>
        <text x="20" y="26" text-anchor="middle" fill="white" font-family="sans-serif" font-size="14" font-weight="600">
          ${initials}
        </text>
      </svg>
    `)}`;
  },

  /**
   * Récupère le dernier token d'affiliation actif d'un utilisateur
   * Utilisé pour l'affiliation automatique via les liens de conversation /join
   *
   * @param userId - ID de l'utilisateur dont on veut récupérer le token d'affiliation
   * @returns Le token d'affiliation actif ou null si aucun
   */
  async getUserAffiliateToken(userId: string): Promise<ApiResponse<{ token: string } | null>> {
    try {
      const response = await apiService.get<{ token: string }>(`/users/${userId}/affiliate-token`);
      return response;
    } catch (error) {
      // Échec silencieux - l'affiliation n'est pas critique
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[UsersService] Impossible de récupérer le token d'affiliation pour l'utilisateur ${userId}:`, error);
      }
      // Retourner une réponse avec data null en cas d'erreur
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to fetch affiliate token'
      };
    }
  },
};

export default usersService;
