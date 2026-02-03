import { SocketIOUser } from '@/types';
import { UserRoleEnum } from '@meeshy/shared/types';
import { buildApiUrl } from '@/lib/config';
import { authManager } from './auth-manager.service';


// Interface pour la réponse d'authentification
export interface AuthResponse {
  success: boolean;
  data?: {
    user: SocketIOUser;
    token: string;
    expiresIn: number;
  };
  error?: string;
}

// Interface pour les permissions utilisateur
export interface UserPermissions {
  canAccessAdmin: boolean;
  canManageUsers: boolean;
  canManageGroups: boolean;
  canManageConversations: boolean;
  canViewAnalytics: boolean;
  canModerateContent: boolean;
  canViewAuditLogs: boolean;
  canManageNotifications: boolean;
  canManageTranslations: boolean;
}

// Interface pour la réponse du profil utilisateur
export interface UserProfileResponse {
  success: boolean;
  data?: {
    user: SocketIOUser;
    permissions: UserPermissions;
  };
  error?: string;
}

class AuthService {
  private static instance: AuthService;
  private baseUrl: string;

  private constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://gate.meeshy.me';
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Authentifie un utilisateur avec username/password
   * Utilise AuthManager pour gestion centralisée des credentials
   */
  async login(username: string, password: string): Promise<AuthResponse> {
    try {
      const response = await fetch(buildApiUrl('/auth/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (data.success && data.data?.token) {
        // NOUVEAU: Utiliser AuthManager (source unique de vérité)
        // Nettoie automatiquement les sessions précédentes
        authManager.setCredentials(
          data.data.user,
          data.data.token,
          data.data.refreshToken,
          data.data.expiresIn
        );
      } else {
        // Si erreur de connexion, nettoyer par précaution
        authManager.clearAllSessions();
      }

      return data;
    } catch (error) {
      console.error('Erreur lors de la connexion:', error);

      // Si erreur, nettoyer par précaution
      authManager.clearAllSessions();

      return {
        success: false,
        error: 'Erreur de connexion au serveur'
      };
    }
  }

  /**
   * Déconnecte l'utilisateur
   * Utilise AuthManager pour nettoyage centralisé
   */
  async logout(): Promise<void> {
    try {
      const token = authManager.getAuthToken();
      if (token) {
        await fetch(buildApiUrl('/auth/logout'), {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      }
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
    } finally {
      // NOUVEAU: Utiliser AuthManager pour nettoyage complet
      authManager.clearAllSessions();
    }
  }

  /**
   * Récupère les informations de l'utilisateur connecté (API call)
   */
  async getCurrentUser(): Promise<UserProfileResponse> {
    try {
      const token = authManager.getAuthToken();
      if (!token) {
        return {
          success: false,
          error: 'Aucun token d\'authentification'
        };
      }

      const response = await fetch(buildApiUrl('/auth/me'), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.success && data.data?.user) {
        // Mettre à jour via AuthManager
        authManager.updateUser(data.data.user);
      }

      return data;
    } catch (error) {
      console.error('Erreur lors de la récupération du profil:', error);
      return {
        success: false,
        error: 'Erreur de connexion au serveur'
      };
    }
  }

  /**
   * Rafraîchit le token d'authentification (API call)
   */
  async refreshToken(): Promise<AuthResponse> {
    try {
      const token = authManager.getAuthToken();
      const refreshToken = authManager.getRefreshToken();

      if (!token && !refreshToken) {
        return {
          success: false,
          error: 'Aucun token à rafraîchir'
        };
      }

      const response = await fetch(buildApiUrl('/auth/refresh'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, refreshToken }),
      });

      const data = await response.json();

      if (data.success && data.data?.token) {
        // Mettre à jour via AuthManager
        authManager.updateTokens(
          data.data.token,
          data.data.refreshToken,
          data.data.expiresIn
        );
      }

      return data;
    } catch (error) {
      console.error('Erreur lors du rafraîchissement du token:', error);
      return {
        success: false,
        error: 'Erreur de connexion au serveur'
      };
    }
  }
}

// Export de l'instance singleton
export const authService = AuthService.getInstance();
