/**
 * Auth Manager Service - Centralized Authentication Credential Management
 */

import type { User } from '@/types';
import { logger } from '@/utils/logger';
import { AUTH_STORAGE_KEYS, SESSION_STORAGE_KEYS } from '@/constants/auth';
import { decodeJwtPayload } from '@/utils/jwt';

// Re-export constants for backward compatibility
export { AUTH_STORAGE_KEYS, SESSION_STORAGE_KEYS };

interface AnonymousSession {
  token: string;
  participantId: string;
  expiresAt: number;
}

class AuthManager {
  private static instance: AuthManager;
  private onClearCallbacks: Array<() => void> = [];
  private onTokensUpdatedCallbacks = new Set<() => void>();

  private constructor() {}

  public static getInstance(): AuthManager {
    /* istanbul ignore else */
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  /**
   * Register a callback to be called when all sessions are cleared
   */
  public registerOnClear(callback: () => void) {
    this.onClearCallbacks.push(callback);
  }

  /**
   * Subscribe to "a freshly minted auth token just landed in storage".
   *
   * A silent refresh (the REST 401 path) replaces the credentials without any
   * user-visible event. Layers that captured the OLD credentials — first and
   * foremost the realtime socket, whose handshake carries the token — have no
   * other way to learn about it: `updateTokens()` is the single point every
   * refreshed token passes through.
   *
   * Deliberately NOT fired by `clearAllSessions()`: losing the credentials is
   * the opposite signal, and it already has `registerOnClear()`. Subscribers
   * run after the new values are committed to storage, so a subscriber that
   * calls `getAuthToken()` reads the token that just landed.
   *
   * Returns an unsubscribe function.
   */
  public registerOnTokensUpdated(callback: () => void): () => void {
    this.onTokensUpdatedCallbacks.add(callback);
    return () => {
      this.onTokensUpdatedCallbacks.delete(callback);
    };
  }

  private notifyTokensUpdated(): void {
    for (const callback of this.onTokensUpdatedCallbacks) {
      try {
        callback();
      } catch (error) {
        logger.warn('[AuthManager]', 'tokens-updated subscriber failed', { error });
      }
    }
  }

  // ==================== CREDENTIALS (RW) ====================

  /**
   * Persiste les credentials d'un compte inscrit — seul point d'écriture pour
   * `AUTH_TOKEN` / `REFRESH_TOKEN` / `SESSION_TOKEN` / `USER_DATA` ensemble.
   *
   * Cinq paramètres positionnels, dont trois `string | undefined`
   * indiscernables au typage : le compilateur ne peut pas voir un
   * `refreshToken` glissé dans le créneau `sessionToken`, ni un `expiresIn`
   * (nombre) glissé dans un créneau `string | undefined` — trois des quatre
   * appelants historiques s'y sont trompés, deux d'entre eux à deux crans
   * (#4404). Passer explicitement `undefined` pour tout paramètre dont la
   * source n'a pas de valeur ; ne JAMAIS décaler l'argument suivant dans le
   * créneau resté vide. Modèle de référence : `hooks/use-auth.ts:173`.
   */
  setCredentials(
    user: User,
    authToken: string,
    refreshToken?: string,
    sessionToken?: string,
    expiresIn?: number
  ): void {
    /* istanbul ignore next */
    if (typeof window === 'undefined') return;

    this.clearAllSessions();

    // Store tokens in localStorage for persistence and easy access outside React
    localStorage.setItem(AUTH_STORAGE_KEYS.AUTH_TOKEN, authToken);
    if (refreshToken) localStorage.setItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
    if (sessionToken) localStorage.setItem(AUTH_STORAGE_KEYS.SESSION_TOKEN, sessionToken);
    localStorage.setItem(AUTH_STORAGE_KEYS.USER_DATA, JSON.stringify(user));

    this.setSessionCookie(user);
  }

  updateUser(user: User): void {
    /* istanbul ignore next */
    if (typeof window === 'undefined') return;
    localStorage.setItem(AUTH_STORAGE_KEYS.USER_DATA, JSON.stringify(user));
    this.setSessionCookie(user);
  }

  updateTokens(authToken: string, refreshToken?: string, sessionToken?: string, expiresIn?: number): void {
    /* istanbul ignore next */
    if (typeof window === 'undefined') return;
    localStorage.setItem(AUTH_STORAGE_KEYS.AUTH_TOKEN, authToken);
    if (refreshToken) localStorage.setItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
    if (sessionToken) localStorage.setItem(AUTH_STORAGE_KEYS.SESSION_TOKEN, sessionToken);

    this.notifyTokensUpdated();
  }

  // ==================== GETTERS ====================

  getAuthToken(): string | null {
    /* istanbul ignore next */
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN);
  }

  getRefreshToken(): string | null {
    /* istanbul ignore next */
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN);
  }

  getCurrentUser(): User | null {
    /* istanbul ignore next */
    if (typeof window === 'undefined') return null;
    const data = localStorage.getItem(AUTH_STORAGE_KEYS.USER_DATA);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  isAuthenticated(): boolean {
    return !!this.getAuthToken();
  }

  // ==================== ANONYMOUS SESSIONS ====================

  /**
   * Ouvre une session anonyme — dans SON emplacement, et nulle part ailleurs.
   *
   * Un jeton `anon_…` n'est pas un JWT, et l'emplacement `AUTH_TOKEN` ne porte
   * que des JWT. L'y déposer aussi trompait tout ce qui le relit :
   *
   *   - `checkAuthStatus()` prenait la branche compte inscrit et interrogeait
   *     `/auth/me` en `Authorization: Bearer anon_…` — refusé — sans jamais
   *     atteindre la branche anonyme (`/anonymous/refresh`) : le participant
   *     revenait « ni identifié, ni anonyme » à chaque rechargement ;
   *   - `isJWTExpired()` répond `true` sur tout ce qu'il ne sait pas décoder,
   *     donc `apiService.request()` refusait d'émettre (« Session expirée »)
   *     et `ConnectionService.initializeConnection()` n'ouvrait aucune socket.
   *
   * L'emplacement JWT est vidé au passage : les deux identités s'excluent, et
   * un navigateur qui traîne encore un `anon_…` déposé là par une version
   * précédente se répare en rejoignant.
   */
  setAnonymousSession(token: string, participantId: string, expiresHours: number = 24): void {
    /* istanbul ignore next */
    if (typeof window === 'undefined') return;

    const expiresAt = Date.now() + (expiresHours * 60 * 60 * 1000);
    const session: AnonymousSession = { token, participantId, expiresAt };

    localStorage.setItem(AUTH_STORAGE_KEYS.ANONYMOUS_SESSION, JSON.stringify(session));
    this.safeRemoveItem(AUTH_STORAGE_KEYS.AUTH_TOKEN);
  }

  getAnonymousSession(): AnonymousSession | null {
    /* istanbul ignore next */
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

  getSessionToken(): string | null {
    return this.getAnonymousSession()?.token ?? null;
  }

  decodeJWT(token: string): Record<string, unknown> | null {
    return decodeJwtPayload(token);
  }

  // ==================== CLEANUP ====================

  clearAllSessions(): void {
    /* istanbul ignore next */
    if (typeof window === 'undefined') return;

    try {
      // 0. Notify subscribers (like the store) to clear their reactive state
      this.onClearCallbacks.forEach(cb => {
        try { cb(); } catch(e) {}
      });

      // 1. Cleanup storage
      localStorage.removeItem(AUTH_STORAGE_KEYS.AUTH_TOKEN);
      localStorage.removeItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN);
      localStorage.removeItem(AUTH_STORAGE_KEYS.SESSION_TOKEN);
      localStorage.removeItem(AUTH_STORAGE_KEYS.USER_DATA);

      this.clearAnonymousSessions();

      this.safeRemoveItem(AUTH_STORAGE_KEYS.RECENT_SEARCHES);
      this.safeRemoveItem(AUTH_STORAGE_KEYS.AFFILIATE_TOKEN);
      this.safeRemoveItem(AUTH_STORAGE_KEYS.APP_STATE);

      // 2. Cleanup Cookies & SessionStorage
      this.clearAuthCookies();
      this.clearTemporaryAuthData();

      // 3. Dynamic cleanups to avoid circular deps
      try {
        const { meeshySocketIOService } = require('./meeshy-socketio.service');
        if (meeshySocketIOService?.cleanup) meeshySocketIOService.cleanup();
      } catch (e) {}

    } catch (error) {
      logger.error('[AuthManager]', 'Error clearing sessions', { error });
    }
  }

  async logout(): Promise<void> {
    this.clearAllSessions();
  }

  clearAnonymousSessions(): void {
    this.safeRemoveItem(AUTH_STORAGE_KEYS.ANONYMOUS_SESSION);
    this.safeRemoveItem(AUTH_STORAGE_KEYS.ANONYMOUS_SESSION_TOKEN);
    this.safeRemoveItem(AUTH_STORAGE_KEYS.ANONYMOUS_PARTICIPANT);
    this.safeRemoveItem(AUTH_STORAGE_KEYS.ANONYMOUS_CURRENT_LINK_ID);
    this.safeRemoveItem(AUTH_STORAGE_KEYS.ANONYMOUS_CURRENT_SHARE_LINK);
    this.safeRemoveItem(AUTH_STORAGE_KEYS.ANONYMOUS_JUST_JOINED);
  }

  private clearAuthCookies(): void {
    /* istanbul ignore next */
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

  private setSessionCookie(user: User): void {
    /* istanbul ignore next */
    if (typeof document === 'undefined') return;

    const sessionData = {
      role: user.role,
      canAccessAdmin: (user as any).canAccessAdmin || ['ADMIN', 'SUPER_ADMIN', 'MODERATOR'].includes(user.role),
      userId: user.id
    };

    const encodedData = btoa(JSON.stringify(sessionData));
    const maxAge = 7 * 24 * 60 * 60;

    document.cookie = `meeshy_session=${encodedData};max-age=${maxAge};path=/;SameSite=Lax${process.env.NODE_ENV === 'production' ? ';Secure' : ''}`;
  }

  private safeRemoveItem(key: string): void {
    /* istanbul ignore next */
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }

  clearTemporaryAuthData(): void {
    /* istanbul ignore next */
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEYS.TWO_FACTOR_TEMP_TOKEN);
      sessionStorage.removeItem(SESSION_STORAGE_KEYS.TWO_FACTOR_USER_ID);
      sessionStorage.removeItem(SESSION_STORAGE_KEYS.TWO_FACTOR_USERNAME);
    } catch (e) {}
  }
}

export const authManager = AuthManager.getInstance();
