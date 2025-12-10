/**
 * Push Token Service
 * Gère la synchronisation des tokens FCM avec le backend
 */

import axios from 'axios';

interface RegisterTokenPayload {
  token: string;
  deviceInfo?: {
    userAgent: string;
    platform: string;
    language: string;
  };
}

interface RegisterTokenResponse {
  success: boolean;
  message?: string;
}

interface DeleteTokenResponse {
  success: boolean;
  message?: string;
}

class PushTokenService {
  private baseURL: string;
  private lastRegisteredToken: string | null = null;

  constructor() {
    this.baseURL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
  }

  /**
   * Log helper
   */
  private log(...args: any[]): void {
    if (process.env.NODE_ENV === 'development') {
      console.log('[PushTokenService]', ...args);
    }
  }

  /**
   * Obtient les informations du device
   */
  private getDeviceInfo() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return undefined;
    }

    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
    };
  }

  /**
   * Enregistre le token FCM sur le backend
   */
  async registerToken(token: string): Promise<RegisterTokenResponse> {
    // Éviter les enregistrements dupliqués
    if (token === this.lastRegisteredToken) {
      this.log('Token already registered, skipping');
      return { success: true, message: 'Token already registered' };
    }

    try {
      this.log('Registering FCM token...');

      const payload: RegisterTokenPayload = {
        token,
        deviceInfo: this.getDeviceInfo(),
      };

      const response = await axios.post<RegisterTokenResponse>(
        `${this.baseURL}/api/users/push-token`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          withCredentials: true, // Important pour envoyer les cookies de session
        }
      );

      if (response.data.success) {
        this.lastRegisteredToken = token;
        this.log('Token registered successfully');

        // Sauvegarder dans localStorage pour persistance
        if (typeof window !== 'undefined') {
          localStorage.setItem('fcm_token_registered', token);
          localStorage.setItem('fcm_token_registered_at', Date.now().toString());
        }
      }

      return response.data;
    } catch (error) {
      console.error('[PushTokenService] Registration error:', error);

      if (axios.isAxiosError(error)) {
        return {
          success: false,
          message: error.response?.data?.message || error.message || 'Registration failed',
        };
      }

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Supprime le token FCM du backend
   */
  async deleteToken(token?: string): Promise<DeleteTokenResponse> {
    try {
      this.log('Deleting FCM token...');

      const tokenToDelete = token || this.lastRegisteredToken;

      if (!tokenToDelete) {
        this.log('No token to delete');
        return { success: true, message: 'No token to delete' };
      }

      const response = await axios.delete<DeleteTokenResponse>(
        `${this.baseURL}/api/users/push-token`,
        {
          data: { token: tokenToDelete },
          headers: {
            'Content-Type': 'application/json',
          },
          withCredentials: true,
        }
      );

      if (response.data.success) {
        this.lastRegisteredToken = null;
        this.log('Token deleted successfully');

        // Nettoyer localStorage
        if (typeof window !== 'undefined') {
          localStorage.removeItem('fcm_token_registered');
          localStorage.removeItem('fcm_token_registered_at');
        }
      }

      return response.data;
    } catch (error) {
      console.error('[PushTokenService] Deletion error:', error);

      if (axios.isAxiosError(error)) {
        return {
          success: false,
          message: error.response?.data?.message || error.message || 'Deletion failed',
        };
      }

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Vérifie si le token doit être rafraîchi
   * (basé sur la date du dernier enregistrement)
   */
  shouldRefreshToken(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    const registeredAt = localStorage.getItem('fcm_token_registered_at');
    if (!registeredAt) {
      return true; // Jamais enregistré
    }

    const hoursSinceRegistration = (Date.now() - parseInt(registeredAt)) / (1000 * 60 * 60);

    // Rafraîchir toutes les 24 heures
    return hoursSinceRegistration >= 24;
  }

  /**
   * Obtient le token enregistré depuis localStorage
   */
  getRegisteredToken(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }

    return localStorage.getItem('fcm_token_registered');
  }

  /**
   * Vérifie si un token est actuellement enregistré
   */
  hasRegisteredToken(): boolean {
    return !!this.getRegisteredToken();
  }

  /**
   * Synchronise le token avec le backend si nécessaire
   */
  async syncToken(currentToken: string): Promise<boolean> {
    const registeredToken = this.getRegisteredToken();

    // Si même token et pas besoin de refresh, skip
    if (registeredToken === currentToken && !this.shouldRefreshToken()) {
      this.log('Token already synced');
      return true;
    }

    // Enregistrer le nouveau token
    const result = await this.registerToken(currentToken);
    return result.success;
  }

  /**
   * Nettoie l'état local
   */
  cleanup(): void {
    this.lastRegisteredToken = null;
  }
}

// Instance singleton
let pushTokenServiceInstance: PushTokenService | null = null;

/**
 * Obtient l'instance singleton du PushTokenService
 */
export function getPushTokenService(): PushTokenService {
  if (!pushTokenServiceInstance) {
    pushTokenServiceInstance = new PushTokenService();
  }
  return pushTokenServiceInstance;
}

/**
 * Réinitialise l'instance singleton (tests)
 */
export function resetPushTokenService(): void {
  if (pushTokenServiceInstance) {
    pushTokenServiceInstance.cleanup();
    pushTokenServiceInstance = null;
  }
}

// Export des utilitaires
export const pushTokenService = {
  /**
   * Enregistre un token
   */
  register: (token: string): Promise<RegisterTokenResponse> => {
    return getPushTokenService().registerToken(token);
  },

  /**
   * Supprime un token
   */
  delete: (token?: string): Promise<DeleteTokenResponse> => {
    return getPushTokenService().deleteToken(token);
  },

  /**
   * Synchronise le token
   */
  sync: (token: string): Promise<boolean> => {
    return getPushTokenService().syncToken(token);
  },

  /**
   * Vérifie si refresh nécessaire
   */
  shouldRefresh: (): boolean => {
    return getPushTokenService().shouldRefreshToken();
  },

  /**
   * Obtient le token enregistré
   */
  getRegistered: (): string | null => {
    return getPushTokenService().getRegisteredToken();
  },

  /**
   * Vérifie si un token est enregistré
   */
  hasRegistered: (): boolean => {
    return getPushTokenService().hasRegisteredToken();
  },
};

export default pushTokenService;
