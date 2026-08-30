import { logger } from '@/utils/logger';
import { SocketIOUser } from '@/types';
import { UserRoleEnum } from '@meeshy/shared/types';
import { buildApiUrl } from '@/lib/config';
import { API_ENDPOINTS } from '@meeshy/shared/api/endpoints';
import { authManager } from './auth-manager.service';


// Interface pour la réponse d'authentification
export interface AuthResponse {
  success: boolean;
  data?: {
    user: SocketIOUser;
    token: string;
    // Le même sessionToken que celui envoyé (glissé en TTL côté serveur,
    // jamais renouvelé) — présent uniquement sur la réponse de /auth/refresh.
    sessionToken?: string;
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
      const response = await fetch(buildApiUrl(API_ENDPOINTS.auth.login), {
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
        authManager.setCredentials({
          user: data.data.user,
          authToken: data.data.token,
          refreshToken: data.data.refreshToken,
          sessionToken: data.data.sessionToken,
          expiresIn: data.data.expiresIn,
        });
      } else {
        // Si erreur de connexion, nettoyer par précaution
        authManager.clearAllSessions();
      }

      return data;
    } catch (error) {
      logger.error('[Service]', 'Erreur lors de la connexion', { error });

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
        await fetch(buildApiUrl(API_ENDPOINTS.auth.logout), {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      }
    } catch (error) {
      logger.error('[Service]', 'Erreur lors de la déconnexion', { error });
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

      const response = await fetch(buildApiUrl(API_ENDPOINTS.auth.me), {
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
      logger.error('[Service]', 'Erreur lors de la récupération du profil', { error });
      return {
        success: false,
        error: 'Erreur de connexion au serveur'
      };
    }
  }

  /**
   * Rafraîchit le token d'authentification (API call)
   *
   * Corps STRICTEMENT aligné sur le schéma serveur de `POST /api/v1/auth/refresh`
   * (`AuthSchemas.refreshToken`, `services/gateway/src/routes/auth/magic-link.ts`) :
   * `token` (le JWT, éventuellement expiré — REQUIS, la route répond 400 sans lui)
   * et `sessionToken` (le jeton de session longue durée du login — OPTIONNEL,
   * active le renouvellement à fenêtre glissante). Il n'y a AUCUN champ
   * `refreshToken` dans ce schéma, et la route ne lit jamais l'en-tête
   * `Authorization` (`security: []`).
   *
   * `sessionToken` vient de l'APPELANT : `AuthManager` n'a pas de lecteur pour
   * le sien (`getSessionToken()` y lit la session ANONYME, un concept distinct —
   * seuls `setCredentials`/`updateTokens` écrivent la valeur du compte inscrit).
   * Le store Zustand, lui, la garde dans son propre état persisté.
   */
  async refreshToken(sessionToken?: string | null): Promise<AuthResponse> {
    try {
      const token = authManager.getAuthToken();

      if (!token) {
        return {
          success: false,
          error: 'Aucun token à rafraîchir'
        };
      }

      const response = await fetch(buildApiUrl(API_ENDPOINTS.auth.refresh), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, sessionToken: sessionToken ?? undefined }),
      });

      const data = await response.json();

      if (data.success && data.data?.token) {
        // Mettre à jour via AuthManager — le serveur ne rend jamais de
        // refreshToken (absent de son schéma), et le sessionToken qu'il rend
        // est le MÊME que celui envoyé (TTL glissé côté serveur uniquement).
        authManager.updateTokens(
          data.data.token,
          undefined,
          data.data.sessionToken,
          data.data.expiresIn
        );
      }

      return data;
    } catch (error) {
      logger.error('[Service]', 'Erreur lors du rafraîchissement du token', { error });
      return {
        success: false,
        error: 'Erreur de connexion au serveur'
      };
    }
  }
}

// Export de l'instance singleton
export const authService = AuthService.getInstance();
