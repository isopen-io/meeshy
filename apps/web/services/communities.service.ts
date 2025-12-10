import { apiService } from './api.service';
import type { 
  Conversation, 
  User,
  ApiResponse 
} from '@meeshy/shared/types';

export interface Community {
  id: string;
  name: string;
  identifier: string;
  description?: string;
  avatar?: string;
  isPrivate: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  creator?: {
    id: string;
    username: string;
    displayName?: string;
    avatar?: string;
  };
  members?: Array<{
    id: string;
    userId: string;
    role: string;
    joinedAt: Date;
    user: {
      id: string;
      username: string;
      displayName?: string;
      avatar?: string;
      isOnline: boolean;
    };
  }>;
  _count?: {
    members: number;
    conversations: number;
  };
}

export interface CreateCommunityRequest {
  name: string;
  identifier?: string;
  description?: string;
  avatar?: string;
  isPrivate?: boolean;
}

export interface UpdateCommunityRequest {
  name?: string;
  identifier?: string;
  description?: string;
  avatar?: string;
  isPrivate?: boolean;
}

/**
 * Service pour gérer les communautés
 */
export const communitiesService = {
  /**
   * Récupère toutes les communautés de l'utilisateur connecté
   */
  async getCommunities(search?: string): Promise<ApiResponse<Community[]>> {
    try {
      const params = search ? { search } : {};
      const response = await apiService.get<Community[]>('/communities', { params });
      return response;
    } catch (error) {
      console.error('Erreur lors de la récupération des communautés:', error);
      throw error;
    }
  },

  /**
   * Récupère une communauté par son ID
   */
  async getCommunity(id: string): Promise<ApiResponse<Community>> {
    try {
      const response = await apiService.get<Community>(`/communities/${id}`);
      return response;
    } catch (error) {
      console.error('Erreur lors de la récupération de la communauté:', error);
      throw error;
    }
  },

  /**
   * Récupère une communauté par son identifiant
   */
  async getCommunityByIdentifier(identifier: string): Promise<ApiResponse<Community>> {
    try {
      const response = await apiService.get<Community>(`/communities/identifier/${identifier}`);
      return response;
    } catch (error) {
      console.error('Erreur lors de la récupération de la communauté par identifiant:', error);
      throw error;
    }
  },

  /**
   * Récupère les conversations d'une communauté
   */
  async getCommunityConversations(communityId: string): Promise<ApiResponse<Conversation[]>> {
    try {
      const response = await apiService.get<Conversation[]>(`/communities/${communityId}/conversations`);
      return response;
    } catch (error) {
      console.error('Erreur lors de la récupération des conversations de la communauté:', error);
      throw error;
    }
  },

  /**
   * Crée une nouvelle communauté
   */
  async createCommunity(data: CreateCommunityRequest): Promise<ApiResponse<Community>> {
    try {
      const response = await apiService.post<Community>('/communities', data);
      return response;
    } catch (error) {
      console.error('Erreur lors de la création de la communauté:', error);
      throw error;
    }
  },

  /**
   * Met à jour une communauté
   */
  async updateCommunity(id: string, data: UpdateCommunityRequest): Promise<ApiResponse<Community>> {
    try {
      const response = await apiService.put<Community>(`/communities/${id}`, data);
      return response;
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la communauté:', error);
      throw error;
    }
  },

  /**
   * Supprime une communauté
   */
  async deleteCommunity(id: string): Promise<ApiResponse<void>> {
    try {
      const response = await apiService.delete<void>(`/communities/${id}`);
      return response;
    } catch (error) {
      console.error('Erreur lors de la suppression de la communauté:', error);
      throw error;
    }
  },

  /**
   * Ajoute un membre à une communauté
   */
  async addMember(communityId: string, userId: string): Promise<ApiResponse<void>> {
    try {
      const response = await apiService.post<void>(`/communities/${communityId}/members`, { userId });
      return response;
    } catch (error) {
      console.error('Erreur lors de l\'ajout du membre:', error);
      throw error;
    }
  },

  /**
   * Retire un membre d'une communauté
   */
  async removeMember(communityId: string, memberId: string): Promise<ApiResponse<void>> {
    try {
      const response = await apiService.delete<void>(`/communities/${communityId}/members/${memberId}`);
      return response;
    } catch (error) {
      console.error('Erreur lors de la suppression du membre:', error);
      throw error;
    }
  }
};
