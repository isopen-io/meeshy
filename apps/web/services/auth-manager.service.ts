/**
 * Auth Manager Service - Centralized Authentication Credential Management
 */

import type { User } from '@/types';
import { AUTH_STORAGE_KEYS, SESSION_STORAGE_KEYS } from '@/constants/auth';

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

  private constructor() {}

  public static getInstance(): AuthManager {
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

  // ==================== CREDENTIALS (RW) ====================

  setCredentials(
    user: User,
    authToken: string,
    refreshToken?: string,
    sessionToken?: string,
    expiresIn?: number
  ): void {
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
    if (typeof window === 'undefined') return;
    localStorage.setItem(AUTH_STORAGE_KEYS.USER_DATA, JSON.stringify(user));
    this.setSessionCookie(user);
  }

  updateTokens(authToken: string, refreshToken?: string, sessionToken?: string, expiresIn?: number): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(AUTH_STORAGE_KEYS.AUTH_TOKEN, authToken);
    if (refreshToken) localStorage.setItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
    if (sessionToken) localStorage.setItem(AUTH_STORAGE_KEYS.SESSION_TOKEN, sessionToken);
  }

  // ==================== GETTERS ====================

  getAuthToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN);
  }

  getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN);
  }

  getCurrentUser(): User | null {
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

  setAnonymousSession(token: string, participantId: string, expiresHours: number = 24): void {
    if (typeof window === 'undefined') return;

    const expiresAt = Date.now() + (expiresHours * 60 * 60 * 1000);
    const session: AnonymousSession = { token, participantId, expiresAt };

    localStorage.setItem(AUTH_STORAGE_KEYS.ANONYMOUS_SESSION, JSON.stringify(session));
    localStorage.setItem(AUTH_STORAGE_KEYS.AUTH_TOKEN, token);
  }

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

  getSessionToken(): string | null {
    return this.getAnonymousSession()?.token ?? null;
  }

  decodeJWT(token: string): Record<string, unknown> | null {
    try {
      const payload = token.split('.')[1];
      if (!payload) return null;
      return JSON.parse(atob(payload));
    } catch {
      return null;
    }
  }

  // ==================== CLEANUP ====================

  clearAllSessions(): void {
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
      console.error('[AUTH_MANAGER] Error clearing sessions:', error);
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
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }

  clearTemporaryAuthData(): void {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEYS.TWO_FACTOR_TEMP_TOKEN);
      sessionStorage.removeItem(SESSION_STORAGE_KEYS.TWO_FACTOR_USER_ID);
      sessionStorage.removeItem(SESSION_STORAGE_KEYS.TWO_FACTOR_USERNAME);
    } catch (e) {}
  }
}

export const authManager = AuthManager.getInstance();
