import { buildApiUrl } from '@/lib/config';
import { authManager } from './auth-manager.service';

// Interface pour le statut 2FA
export interface TwoFactorStatusResponse {
  success: boolean;
  data?: {
    enabled: boolean;
    enabledAt: Date | null;
    hasBackupCodes: boolean;
    backupCodesCount: number;
  };
  error?: string;
}

// Interface pour le setup 2FA
export interface TwoFactorSetupResponse {
  success: boolean;
  data?: {
    secret: string;
    qrCodeDataUrl: string;
    otpauthUrl: string;
  };
  error?: string;
}

// Interface pour l'activation 2FA
export interface TwoFactorEnableResponse {
  success: boolean;
  data?: {
    message: string;
    backupCodes: string[];
  };
  error?: string;
}

// Interface pour la vérification 2FA
export interface TwoFactorVerifyResponse {
  success: boolean;
  data?: {
    user: {
      id: string;
      username: string;
      email: string;
      firstName: string;
      lastName: string;
      displayName: string;
      avatar?: string;
      role: string;
      systemLanguage: string;
      regionalLanguage?: string;
    };
    token: string;
    sessionToken?: string;
    expiresIn: number;
    usedBackupCode?: boolean;
  };
  error?: string;
}

// Interface pour la désactivation 2FA
export interface TwoFactorDisableResponse {
  success: boolean;
  data?: {
    message: string;
  };
  error?: string;
}

// Interface pour la génération de nouveaux codes de backup
export interface TwoFactorBackupCodesResponse {
  success: boolean;
  data?: {
    backupCodes: string[];
  };
  error?: string;
}

class TwoFactorService {
  private static instance: TwoFactorService;

  private constructor() {}

  public static getInstance(): TwoFactorService {
    if (!TwoFactorService.instance) {
      TwoFactorService.instance = new TwoFactorService();
    }
    return TwoFactorService.instance;
  }

  /**
   * Obtenir les headers d'authentification
   */
  private getAuthHeaders(): HeadersInit {
    const token = authManager.getAuthToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  /**
   * Récupère le statut 2FA de l'utilisateur
   */
  async getStatus(): Promise<TwoFactorStatusResponse> {
    try {
      const response = await fetch(buildApiUrl('/auth/2fa/status'), {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      return await response.json();
    } catch (error) {
      console.error('[2FA] Erreur lors de la récupération du statut:', error);
      return {
        success: false,
        error: 'Erreur de connexion au serveur',
      };
    }
  }

  /**
   * Démarre la configuration 2FA et récupère le QR code
   */
  async setup(): Promise<TwoFactorSetupResponse> {
    try {
      const response = await fetch(buildApiUrl('/auth/2fa/setup'), {
        method: 'POST',
        headers: this.getAuthHeaders(),
      });

      return await response.json();
    } catch (error) {
      console.error('[2FA] Erreur lors du setup:', error);
      return {
        success: false,
        error: 'Erreur de connexion au serveur',
      };
    }
  }

  /**
   * Active le 2FA avec le code TOTP
   */
  async enable(code: string): Promise<TwoFactorEnableResponse> {
    try {
      const response = await fetch(buildApiUrl('/auth/2fa/enable'), {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ code: code.replace(/\s/g, '') }),
      });

      return await response.json();
    } catch (error) {
      console.error('[2FA] Erreur lors de l\'activation:', error);
      return {
        success: false,
        error: 'Erreur de connexion au serveur',
      };
    }
  }

  /**
   * Vérifie le code 2FA lors de la connexion
   * @param twoFactorToken - Token temporaire reçu lors du login
   * @param code - Code TOTP ou backup code
   */
  async verify(twoFactorToken: string, code: string): Promise<TwoFactorVerifyResponse> {
    try {
      const response = await fetch(buildApiUrl('/auth/2fa/verify'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${twoFactorToken}`,
        },
        body: JSON.stringify({ code: code.replace(/[\s-]/g, '') }),
      });

      const data = await response.json();

      // Si la vérification réussit, configurer les credentials
      if (data.success && data.data?.token) {
        authManager.setCredentials(
          data.data.user,
          data.data.token,
          data.data.sessionToken,
          data.data.expiresIn
        );
      }

      return data;
    } catch (error) {
      console.error('[2FA] Erreur lors de la vérification:', error);
      return {
        success: false,
        error: 'Erreur de connexion au serveur',
      };
    }
  }

  /**
   * Désactive le 2FA
   */
  async disable(password: string, code?: string): Promise<TwoFactorDisableResponse> {
    try {
      const response = await fetch(buildApiUrl('/auth/2fa/disable'), {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          password,
          ...(code ? { code: code.replace(/\s/g, '') } : {}),
        }),
      });

      return await response.json();
    } catch (error) {
      console.error('[2FA] Erreur lors de la désactivation:', error);
      return {
        success: false,
        error: 'Erreur de connexion au serveur',
      };
    }
  }

  /**
   * Régénère les codes de backup
   */
  async regenerateBackupCodes(): Promise<TwoFactorBackupCodesResponse> {
    try {
      const response = await fetch(buildApiUrl('/auth/2fa/backup-codes'), {
        method: 'POST',
        headers: this.getAuthHeaders(),
      });

      return await response.json();
    } catch (error) {
      console.error('[2FA] Erreur lors de la régénération des codes:', error);
      return {
        success: false,
        error: 'Erreur de connexion au serveur',
      };
    }
  }

  /**
   * Annule la configuration 2FA en cours
   */
  async cancelSetup(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(buildApiUrl('/auth/2fa/cancel'), {
        method: 'POST',
        headers: this.getAuthHeaders(),
      });

      return await response.json();
    } catch (error) {
      console.error('[2FA] Erreur lors de l\'annulation:', error);
      return {
        success: false,
        error: 'Erreur de connexion au serveur',
      };
    }
  }
}

// Export de l'instance singleton
export const twoFactorService = TwoFactorService.getInstance();
