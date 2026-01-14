import { buildApiUrl } from '@/lib/config';
import { authManager } from './auth-manager.service';

// Interface pour la demande de Magic Link
export interface MagicLinkRequest {
  email: string;
  deviceFingerprint?: string;
}

// Interface pour la validation de Magic Link
export interface MagicLinkValidation {
  token: string;
  deviceFingerprint?: string;
  // rememberDevice is retrieved server-side for security
}

// Interface utilisateur Magic Link
export interface MagicLinkUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  displayName: string;
  bio?: string;
  avatar?: string;
  role: string;
  isOnline: boolean;
  lastActiveAt: Date;
  systemLanguage: string;
  regionalLanguage?: string;
  customDestinationLanguage?: string;
  autoTranslateEnabled: boolean;
  translateToSystemLanguage: boolean;
  translateToRegionalLanguage: boolean;
  useCustomDestination: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  emailVerifiedAt?: Date;
  phoneVerifiedAt?: Date;
  twoFactorEnabledAt?: Date;
}

// Interface session Magic Link
export interface MagicLinkSession {
  id: string;
  userId: string;
  deviceType?: string;
  deviceVendor?: string;
  deviceModel?: string;
  osName?: string;
  osVersion?: string;
  browserName?: string;
  browserVersion?: string;
  isMobile: boolean;
  ipAddress?: string;
  country?: string;
  city?: string;
  location?: string;
  createdAt: Date;
  lastActivityAt: Date;
  isCurrentSession: boolean;
  isTrusted: boolean;
}

// Interface pour la réponse de demande Magic Link
export interface MagicLinkRequestResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// Interface pour la réponse de validation Magic Link
export interface MagicLinkValidateResponse {
  success: boolean;
  data?: {
    user: MagicLinkUser;
    token: string;
    sessionToken: string;
    session: MagicLinkSession;
    expiresIn: number;
    requires2FA?: boolean;
    twoFactorToken?: string;
  };
  error?: string;
}

class MagicLinkService {
  private static instance: MagicLinkService;

  private constructor() {}

  public static getInstance(): MagicLinkService {
    if (!MagicLinkService.instance) {
      MagicLinkService.instance = new MagicLinkService();
    }
    return MagicLinkService.instance;
  }

  /**
   * Génère un fingerprint basique du device
   */
  private getDeviceFingerprint(): string {
    if (typeof window === 'undefined') return 'server';

    const { userAgent, language, platform } = navigator;
    const screenInfo = `${screen.width}x${screen.height}x${screen.colorDepth}`;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return btoa(`${userAgent}-${language}-${platform}-${screenInfo}-${timezone}`).substring(0, 64);
  }

  /**
   * Demande l'envoi d'un Magic Link par email
   * @param email - User's email address
   * @param rememberDevice - Whether to remember device for long session (stored server-side)
   */
  async requestMagicLink(email: string, rememberDevice: boolean = false): Promise<MagicLinkRequestResponse> {
    try {
      const response = await fetch(buildApiUrl('/auth/magic-link/request'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          deviceFingerprint: this.getDeviceFingerprint(),
          rememberDevice, // Stored server-side for security (not in sessionStorage)
        }),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('[MagicLink] Erreur lors de la demande:', error);
      return {
        success: false,
        error: 'Erreur de connexion au serveur',
      };
    }
  }

  /**
   * Valide un token Magic Link et authentifie l'utilisateur
   * @param token - The magic link token
   * Note: rememberDevice is retrieved from server-side storage (set during request)
   */
  async validateMagicLink(token: string): Promise<MagicLinkValidateResponse> {
    try {
      const response = await fetch(buildApiUrl('/auth/magic-link/validate'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          deviceFingerprint: this.getDeviceFingerprint(),
          // rememberDevice is retrieved server-side for security
        }),
      });

      const data = await response.json();

      // Si la validation réussit et ne nécessite pas de 2FA, configurer les credentials
      if (data.success && data.data?.token && !data.data?.requires2FA) {
        authManager.setCredentials(
          data.data.user,
          data.data.token,
          data.data.sessionToken,
          data.data.expiresIn
        );
      }

      return data;
    } catch (error) {
      console.error('[MagicLink] Erreur lors de la validation:', error);
      return {
        success: false,
        error: 'Erreur de connexion au serveur',
      };
    }
  }
}

// Export de l'instance singleton
export const magicLinkService = MagicLinkService.getInstance();
