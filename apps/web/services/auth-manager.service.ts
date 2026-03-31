/**
 * Auth Manager Service - Centralized Authentication Credential Management
 *
 * This service is the SINGLE SOURCE OF TRUTH for:
 * - Storing/Retrieving Auth tokens (localStorage + Zustand sync)
 * - Handling session cleanup
 * - Managing anonymous vs regular sessions
 *
 * It decouples business logic from storage implementation.
 */

import { useAuthStore } from '@/stores/auth-store';
import { useFailedMessagesStore } from '@/stores/failed-messages-store';
import type { User } from '@/types';

/**
 * Storage keys used by the application
 */
export const AUTH_STORAGE_KEYS = {
  AUTH_TOKEN: 'meeshy_auth_token',
  REFRESH_TOKEN: 'meeshy_refresh_token',
  SESSION_TOKEN: 'meeshy_session_token', // Device persistent token
  USER_DATA: 'meeshy_user_data',
  ANONYMOUS_SESSION: 'meeshy_anonymous_session', // { token, participantId, expiresAt }

  // Legacy/External keys to be managed
  ZUSTAND_AUTH: 'meeshy-auth',
  RECENT_SEARCHES: 'meeshy_recent_searches',
  AFFILIATE_TOKEN: 'meeshy_affiliate_token',
  APP_STATE: 'meeshy-app',

  // Anonymous keys
  ANONYMOUS_SESSION_TOKEN: 'anonymous_session_token',
  ANONYMOUS_PARTICIPANT: 'anonymous_participant',
  ANONYMOUS_CURRENT_LINK_ID: 'anonymous_current_link_id',
  ANONYMOUS_CURRENT_SHARE_LINK: 'anonymous_current_share_link',
  ANONYMOUS_JUST_JOINED: 'anonymous_just_joined',
};

/**
 * Session storage keys (temporary)
 */
const SESSION_STORAGE_KEYS = {
  TWO_FACTOR_TEMP_TOKEN: 'meeshy_2fa_temp_token',
  TWO_FACTOR_USER_ID: 'meeshy_2fa_user_id',
  TWO_FACTOR_USERNAME: 'meeshy_2fa_username',
};

interface AnonymousSession {
  token: string;
  participantId: string;
  expiresAt: number;
}

class AuthManager {
  private static instance: AuthManager;

  private constructor() {}

  public static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  // ==================== CREDENTIALS (RW) ====================

  /**
   * Sets the user credentials and synchronizes stores
   */
  setCredentials(
    user: User,
    authToken: string,
    refreshToken?: string,
    sessionToken?: string,
    expiresIn?: number
  ): void {
    if (typeof window === 'undefined') return;

    if (process.env.NODE_ENV === 'development') {
      console.log('[AUTH_MANAGER] Setting credentials for user:', user.username);
    }

    // 1. Nettoyer les sessions existantes pour repartir à neuf
    this.clearAllSessions();

    // 2. Définir dans le store Zustand (source unique)
    useAuthStore.getState().setUser(user);
    useAuthStore.getState().setTokens(authToken, refreshToken, sessionToken, expiresIn);

    // 3. Créer le cookie de session pour le middleware (Conditional Loading)
    this.setSessionCookie(user);

    if (process.env.NODE_ENV === 'development') {
      console.log('[AUTH_MANAGER] Credentials set successfully');
    }
  }

  /**
   * Update current user data without changing tokens
   */
  updateUser(user: User): void {
    useAuthStore.getState().setUser(user);
    this.setSessionCookie(user);
  }

  /**
   * Update tokens only (e.g. after refresh)
   */
  updateTokens(authToken: string, refreshToken?: string, sessionToken?: string, expiresIn?: number): void {
    useAuthStore.getState().setTokens(authToken, refreshToken, sessionToken, expiresIn);
  }

  // ==================== GETTERS ====================

  /**
   * Récupère le token d'authentification
   */
  getAuthToken(): string | null {
    return useAuthStore.getState().authToken;
  }

  /**
   * Récupère le refresh token
   */
  getRefreshToken(): string | null {
    return useAuthStore.getState().refreshToken;
  }

  /**
   * Récupère l'utilisateur actuel
   */
  getCurrentUser(): User | null {
    return useAuthStore.getState().user;
  }

  /**
   * Vérifie si l'utilisateur est authentifié (token présent + user présent)
   */
  isAuthenticated(): boolean {
    const { authToken, user } = useAuthStore.getState();
    return !!(authToken && user);
  }

  // ==================== ANONYMOUS SESSIONS ====================

  /**
   * Sets an anonymous session
   */
  setAnonymousSession(token: string, participantId: string, expiresHours: number = 24): void {
    if (typeof window === 'undefined') return;

    const expiresAt = Date.now() + (expiresHours * 60 * 60 * 1000);
    const session: AnonymousSession = { token, participantId, expiresAt };

    localStorage.setItem(AUTH_STORAGE_KEYS.ANONYMOUS_SESSION, JSON.stringify(session));

    // Also set tokens in store (acts as a temporary authentication)
    useAuthStore.getState().setTokens(token);

    if (process.env.NODE_ENV === 'development') {
      console.log('[AUTH_MANAGER] Anonymous session set');
    }
  }

  /**
   * Gets anonymous session if not expired
   */
  getAnonymousSession(): AnonymousSession | null {
    if (typeof window === 'undefined') return null;

    const sessionStr = localStorage.getItem(AUTH_STORAGE_KEYS.ANONYMOUS_SESSION);
    if (!sessionStr) return null;

    try {
      const session: AnonymousSession = JSON.parse(sessionStr);
      if (Date.now() > session.expiresAt) {
        this.clearAnonymousSessions();
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }

  // ==================== CLEANUP ====================

  /**
   * Nettoie TOUTES les données de session (Normale + Anonyme)
   * C'est l'unique méthode de déconnexion globale du frontend.
   */
  clearAllSessions(): void {
    // Support SSR Next.js
    if (typeof window === 'undefined') return;

    // Vérifier disponibilité localStorage (iframes cross-origin, private mode)
    if (!window.localStorage) {
      console.warn('[AUTH_MANAGER] localStorage not available, skipping cleanup');
      return;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[AUTH_MANAGER] Clearing all sessions...');
    }

    try {
      // 0. CRITIQUE: Nettoyer le service Socket.IO AVANT de nettoyer les tokens
      // Ceci déconnecte le socket et vide le currentUser du singleton
      // Import dynamique pour éviter les dépendances circulaires
      import('./meeshy-socketio.service').then(({ meeshySocketIOService }) => {
        meeshySocketIOService.cleanup();
        if (process.env.NODE_ENV === 'development') {
          console.log('[AUTH_MANAGER] Socket.IO service cleaned up');
        }
      }).catch((error) => {
        console.warn('[AUTH_MANAGER] Could not cleanup Socket.IO service:', error);
      });

      // 1. Nettoyer le store d'authentification Zustand
      useAuthStore.getState().clearAuth();

      // 2. Nettoyer le store de messages échoués
      useFailedMessagesStore.getState().clearAllFailedMessages();

      // 3. Nettoyer sessions anonymes
      this.clearAnonymousSessions();

      // 4. Nettoyer données tierces
      this.safeRemoveItem(AUTH_STORAGE_KEYS.RECENT_SEARCHES);
      this.safeRemoveItem(AUTH_STORAGE_KEYS.AFFILIATE_TOKEN);

      // 5. Nettoyer app state (UI preferences)
      this.safeRemoveItem(AUTH_STORAGE_KEYS.APP_STATE);

      // 6. Nettoyer cookies de session
      this.clearAuthCookies();

      // 7. CRITIQUE: Nettoyer les données temporaires sessionStorage (tokens 2FA)
      this.clearTemporaryAuthData();

      // 8. Nettoyer les préférences utilisateur (si importable)
      try {
        import('../stores/user-preferences-store').then(({ useUserPreferencesStore }) => {
          useUserPreferencesStore.getState().reset();
        });
      } catch (e) {}

      if (process.env.NODE_ENV === 'development') {
        console.log('[AUTH_MANAGER] All sessions cleared successfully');
      }
    } catch (error) {
      console.error('[AUTH_MANAGER] Error clearing sessions:', error);
    }
  }

  /**
   * Equivalent to clearAllSessions but specifically named for logout context
   */
  async logout(): Promise<void> {
    this.clearAllSessions();
  }

  /**
   * Nettoie uniquement les sessions anonymes
   */
  clearAnonymousSessions(): void {
    this.safeRemoveItem(AUTH_STORAGE_KEYS.ANONYMOUS_SESSION);
    this.safeRemoveItem(AUTH_STORAGE_KEYS.ANONYMOUS_SESSION_TOKEN);
    this.safeRemoveItem(AUTH_STORAGE_KEYS.ANONYMOUS_PARTICIPANT);
    this.safeRemoveItem(AUTH_STORAGE_KEYS.ANONYMOUS_CURRENT_LINK_ID);
    this.safeRemoveItem(AUTH_STORAGE_KEYS.ANONYMOUS_CURRENT_SHARE_LINK);
    this.safeRemoveItem(AUTH_STORAGE_KEYS.ANONYMOUS_JUST_JOINED);
  }

  /**
   * Nettoie les cookies d'authentification
   */
  private clearAuthCookies(): void {
    if (typeof document === 'undefined') return;

    document.cookie.split(";").forEach((c) => {
      const cookieName = c.split("=")[0].trim();
      if (
        cookieName.startsWith('meeshy') ||
        cookieName === 'auth_token' ||
        cookieName === 'session_token'
      ) {
        document.cookie = cookieName + "=;expires=" + new Date(0).toUTCString() + ";path=/";
      }
    });
  }

  // ==================== HELPERS ====================

  /**
   * Crée un cookie de session pour le middleware Next.js
   */
  private setSessionCookie(user: User): void {
    if (typeof document === 'undefined') return;

    const sessionData = {
      role: user.role,
      canAccessAdmin: user.canAccessAdmin || ['ADMIN', 'SUPER_ADMIN', 'MODERATOR'].includes(user.role),
      userId: user.id
    };

    const encodedData = btoa(JSON.stringify(sessionData));

    // Cookie expire dans 7 jours par défaut (ou selon sessionToken)
    const maxAge = 7 * 24 * 60 * 60;

    document.cookie = \`meeshy_session=\${encodedData};max-age=\${maxAge};path=/;SameSite=Lax\${process.env.NODE_ENV === 'production' ? ';Secure' : ''}\`;
  }

  private safeRemoveItem(key: string): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }

  private isSessionStorageAvailable(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const testKey = '__storage_test__';
      window.sessionStorage.setItem(testKey, testKey);
      window.sessionStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  private safeRemoveSessionItem(key: string): void {
    if (!this.isSessionStorageAvailable()) return;
    try {
      sessionStorage.removeItem(key);
    } catch (e) {}
  }

  clearTemporaryAuthData(): void {
    this.safeRemoveSessionItem(SESSION_STORAGE_KEYS.TWO_FACTOR_TEMP_TOKEN);
    this.safeRemoveSessionItem(SESSION_STORAGE_KEYS.TWO_FACTOR_USER_ID);
    this.safeRemoveSessionItem(SESSION_STORAGE_KEYS.TWO_FACTOR_USERNAME);
  }
}

export const authManager = AuthManager.getInstance();
