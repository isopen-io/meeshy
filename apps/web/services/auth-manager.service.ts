/**
 * AUTH MANAGER - Source unique de vérité pour l'authentification
 *
 * RÈGLE D'OR: Aucun code ne doit accéder directement à localStorage
 * pour les credentials. TOUT passe par ce service.
 *
 * Architecture extensible pour supporter le multi-compte dans le futur.
 */

import { useAuthStore } from '@/stores/auth-store';
import { useFailedMessagesStore } from '@/stores/failed-messages-store';
import type { User } from '@/types';

/**
 * Définition centralisée de TOUTES les clés de stockage
 * SOURCE UNIQUE - Modifier ici pour changer une clé
 */
export const AUTH_STORAGE_KEYS = {
  // Zustand persist stores (architecture actuelle)
  ZUSTAND_AUTH: 'meeshy-auth',
  FAILED_MESSAGES: 'meeshy-failed-messages',
  APP_STATE: 'meeshy-app',

  // Sessions anonymes
  ANONYMOUS_SESSION: 'anonymous_session',
  ANONYMOUS_SESSION_TOKEN: 'anonymous_session_token',
  ANONYMOUS_PARTICIPANT: 'anonymous_participant',
  ANONYMOUS_CURRENT_LINK_ID: 'anonymous_current_link_id',
  ANONYMOUS_CURRENT_SHARE_LINK: 'anonymous_current_share_link',
  ANONYMOUS_JUST_JOINED: 'anonymous_just_joined',

  // Données tierces
  RECENT_SEARCHES: 'meeshy_recent_searches',
  AFFILIATE_TOKEN: 'meeshy_affiliate_token',

  // FUTURE: Multi-comptes
  // ACCOUNTS: 'meeshy-accounts',  // { accounts: AccountSession[], activeAccountId: string }
} as const;

/**
 * Définition centralisée des clés sessionStorage (données temporaires)
 * Ces données doivent être nettoyées après utilisation ou lors du logout
 */
export const SESSION_STORAGE_KEYS = {
  // Tokens temporaires 2FA (utilisés pendant le flow de vérification)
  TWO_FACTOR_TEMP_TOKEN: '2fa_temp_token',
  TWO_FACTOR_USER_ID: '2fa_user_id',
  TWO_FACTOR_USERNAME: '2fa_username',
} as const;

/**
 * Interface pour session anonyme avec expiration
 */
export interface AnonymousSession {
  token: string;
  participantId: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * FUTURE: Interface pour multi-comptes
 * Prête pour implémentation future sans breaking changes
 */
export interface AccountSession {
  userId: string;
  user: User;
  authToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  lastActive: Date;
}

/**
 * AuthManager - Gestionnaire centralisé de l'authentification
 * Singleton pattern pour garantir une seule instance
 */
class AuthManager {
  private static instance: AuthManager;

  private constructor() {
    if (process.env.NODE_ENV === 'development') {
    }
  }

  public static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  // ==================== GETTERS - Source unique ====================

  /**
   * Récupère le token d'authentification actuel
   * SOURCE UNIQUE: Store Zustand
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
   * Récupère le session token (pour "Se souvenir de l'appareil")
   */
  getSessionToken(): string | null {
    return useAuthStore.getState().sessionToken;
  }

  /**
   * Récupère l'utilisateur connecté actuel
   * SOURCE UNIQUE: Store Zustand
   */
  getCurrentUser(): User | null {
    return useAuthStore.getState().user;
  }

  /**
   * Vérifie si un utilisateur est authentifié
   */
  isAuthenticated(): boolean {
    return useAuthStore.getState().isAuthenticated;
  }

  /**
   * Vérifie si l'authentification est en cours de vérification
   */
  isAuthChecking(): boolean {
    return useAuthStore.getState().isAuthChecking;
  }

  /**
   * Récupère l'expiration de la session
   */
  getSessionExpiry(): Date | null {
    return useAuthStore.getState().sessionExpiry;
  }

  // ==================== SETTERS - Gestion de session ====================

  /**
   * Définit les credentials d'un utilisateur (login)
   * CRITIQUE: Nettoie TOUTES les sessions avant de définir
   *
   * @param user - Utilisateur à connecter
   * @param authToken - Token d'authentification
   * @param refreshToken - Token de rafraîchissement (optionnel)
   * @param sessionToken - Token de session pour "Se souvenir de l'appareil" (optionnel)
   * @param expiresIn - Durée de validité en secondes (optionnel)
   */
  setCredentials(
    user: User,
    authToken: string,
    refreshToken?: string,
    sessionToken?: string,
    expiresIn?: number
  ): void {
    if (process.env.NODE_ENV === 'development') {
      console.log('[AUTH_MANAGER] setCredentials called with sessionToken:', !!sessionToken, 'expiresIn:', expiresIn);
    }

    // 1. CRITIQUE: Nettoyer TOUTES les sessions précédentes
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
   * Crée un cookie de session pour le middleware Next.js
   * Permet au middleware de vérifier les permissions admin AVANT le chargement du bundle
   * Ce cookie est léger et contient uniquement les infos nécessaires pour le routing
   *
   * @param user - Utilisateur connecté
   */
  private setSessionCookie(user: User): void {
    if (typeof document === 'undefined') return;

    try {
      // Données minimales pour le middleware (role + permissions admin)
      const sessionData = {
        userId: user.id,
        role: user.role,
        canAccessAdmin: user.permissions?.canAccessAdmin || false,
      };

      // Encoder en base64 pour éviter les problèmes de caractères spéciaux
      const encodedData = btoa(JSON.stringify(sessionData));

      // Cookie valide 7 jours (sera rafraîchi à chaque login)
      const maxAge = 7 * 24 * 60 * 60;
      const secure = process.env.NODE_ENV === 'production' ? '; secure' : '';

      document.cookie = `meeshy_session=${encodedData}; max-age=${maxAge}; path=/; samesite=lax${secure}`;

      if (process.env.NODE_ENV === 'development') {
        console.log('[AUTH_MANAGER] Session cookie set for middleware');
      }
    } catch (error) {
      console.warn('[AUTH_MANAGER] Could not set session cookie:', error);
    }
  }

  /**
   * Met à jour uniquement les tokens (refresh)
   */
  updateTokens(authToken: string, refreshToken?: string, sessionToken?: string, expiresIn?: number): void {
    useAuthStore.getState().setTokens(authToken, refreshToken, sessionToken, expiresIn);

    if (process.env.NODE_ENV === 'development') {
      console.log('[AUTH_MANAGER] Tokens updated');
    }
  }

  /**
   * Met à jour uniquement l'utilisateur
   */
  updateUser(user: User | null): void {
    useAuthStore.getState().setUser(user);

    if (process.env.NODE_ENV === 'development') {
    }
  }

  /**
   * Définit l'état de vérification d'authentification
   */
  setAuthChecking(checking: boolean): void {
    useAuthStore.getState().setAuthChecking(checking);
  }

  // ==================== CLEANUP - Nettoyage ====================

  /**
   * Nettoie TOUTES les données de session
   * CRITIQUE: Doit être appelé à chaque déconnexion et avant chaque login
   *
   * Nettoie:
   * - Store Zustand (auth, failed messages, app state)
   * - Sessions anonymes
   * - Données tierces (recherches, affiliate)
   * - Cookies de session
   * - Données temporaires sessionStorage (tokens 2FA, etc.)
   *
   * Support: SSR Next.js, iframes, WAP browsers, private mode
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
      // NOTE: Débattre si on garde les préférences UI entre sessions
      this.safeRemoveItem(AUTH_STORAGE_KEYS.APP_STATE);

      // 6. Nettoyer cookies de session
      this.clearAuthCookies();

      // 7. CRITIQUE: Nettoyer les données temporaires sessionStorage (tokens 2FA)
      // Ces données ne doivent pas persister après un logout ou avant un nouveau login
      this.clearTemporaryAuthData();

      if (process.env.NODE_ENV === 'development') {
        console.log('[AUTH_MANAGER] All sessions cleared successfully');
      }
    } catch (error) {
      console.error('[AUTH_MANAGER] Error clearing sessions:', error);
    }
  }

  /**
   * Nettoie uniquement les sessions anonymes
   * Support: Tous les environnements
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
      // Ne supprimer que les cookies de session Meeshy
      if (
        cookieName.startsWith('meeshy') ||
        cookieName === 'auth_token' ||
        cookieName === 'session_token'
      ) {
        document.cookie = cookieName + "=;expires=" + new Date(0).toUTCString() + ";path=/";
      }
    });
  }

  // ==================== SESSIONS ANONYMES ====================

  /**
   * Définit une session anonyme avec expiration
   * @param token - Token de session anonyme
   * @param participantId - ID du participant anonyme
   * @param expiresInHours - Durée de validité en heures (défaut: 24h)
   *
   * Support: Tous les environnements (SSR, iframes, WAP, private mode)
   */
  setAnonymousSession(token: string, participantId: string, expiresInHours: number = 24): void {
    const now = Date.now();
    const session: AnonymousSession = {
      token,
      participantId,
      createdAt: now,
      expiresAt: now + (expiresInHours * 60 * 60 * 1000),
    };

    const success = this.safeSetItem(
      AUTH_STORAGE_KEYS.ANONYMOUS_SESSION,
      JSON.stringify(session)
    );

    if (success && process.env.NODE_ENV === 'development') {
    } else if (!success) {
      console.warn('[AUTH_MANAGER] Could not save anonymous session (storage unavailable)');
    }
  }

  /**
   * Récupère la session anonyme si elle existe et n'est pas expirée
   * @returns Session anonyme ou null si expirée/inexistante
   *
   * Support: Tous les environnements (SSR, iframes, WAP, private mode)
   */
  getAnonymousSession(): AnonymousSession | null {
    try {
      const data = this.safeGetItem(AUTH_STORAGE_KEYS.ANONYMOUS_SESSION);
      if (!data) return null;

      const session = JSON.parse(data) as AnonymousSession;

      // Vérifier expiration
      if (Date.now() > session.expiresAt) {
        if (process.env.NODE_ENV === 'development') {
        }
        this.clearAnonymousSessions();
        return null;
      }

      return session;
    } catch (error) {
      console.error('[AUTH_MANAGER] Error reading anonymous session:', error);
      return null;
    }
  }

  /**
   * Vérifie si une session anonyme valide existe
   */
  hasValidAnonymousSession(): boolean {
    return this.getAnonymousSession() !== null;
  }

  // ==================== FUTURE: MULTI-COMPTES ====================

  /**
   * FUTURE: Switch entre comptes
   * Architecture prête pour implémentation future
   */
  // switchAccount(userId: string): void {
  //   // Implementation future
  //   // 1. Sauvegarder session actuelle
  //   // 2. Charger session du compte demandé
  //   // 3. Mettre à jour store Zustand
  // }

  /**
   * FUTURE: Récupère tous les comptes disponibles
   */
  // getAvailableAccounts(): AccountSession[] {
  //   // Implementation future
  //   return [];
  // }

  /**
   * FUTURE: Ajoute un nouveau compte
   */
  // addAccount(session: AccountSession): void {
  //   // Implementation future
  // }

  /**
   * FUTURE: Supprime un compte
   */
  // removeAccount(userId: string): void {
  //   // Implementation future
  // }

  // ==================== HELPERS - Support multi-environnements ====================

  /**
   * Vérifie si localStorage est disponible
   * Support: SSR, iframes cross-origin, private mode, WAP browsers
   */
  private isLocalStorageAvailable(): boolean {
    if (typeof window === 'undefined') return false;
    if (!window.localStorage) return false;

    try {
      // Test d'écriture pour vérifier les restrictions
      const testKey = '__meeshy_storage_test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Supprime un item de localStorage de manière sécurisée
   * Support: iframes, private mode, quota exceeded, etc.
   */
  private safeRemoveItem(key: string): void {
    if (!this.isLocalStorageAvailable()) return;

    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn(`[AUTH_MANAGER] Could not remove ${key}:`, error);
    }
  }

  /**
   * Récupère un item de localStorage de manière sécurisée
   */
  private safeGetItem(key: string): string | null {
    if (!this.isLocalStorageAvailable()) return null;

    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn(`[AUTH_MANAGER] Could not get ${key}:`, error);
      return null;
    }
  }

  /**
   * Définit un item dans localStorage de manière sécurisée
   */
  private safeSetItem(key: string, value: string): boolean {
    if (!this.isLocalStorageAvailable()) return false;

    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      // Quota exceeded, private mode, etc.
      console.warn(`[AUTH_MANAGER] Could not set ${key}:`, error);
      return false;
    }
  }

  // ==================== HELPERS - sessionStorage ====================

  /**
   * Vérifie si sessionStorage est disponible
   * Support: SSR, iframes cross-origin, private mode, WAP browsers
   */
  private isSessionStorageAvailable(): boolean {
    if (typeof window === 'undefined') return false;
    if (!window.sessionStorage) return false;

    try {
      // Test d'écriture pour vérifier les restrictions
      const testKey = '__meeshy_session_storage_test__';
      sessionStorage.setItem(testKey, 'test');
      sessionStorage.removeItem(testKey);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Supprime un item de sessionStorage de manière sécurisée
   * Support: iframes, private mode, quota exceeded, etc.
   */
  private safeRemoveSessionItem(key: string): void {
    if (!this.isSessionStorageAvailable()) return;

    try {
      sessionStorage.removeItem(key);
    } catch (error) {
      console.warn(`[AUTH_MANAGER] Could not remove session item ${key}:`, error);
    }
  }

  /**
   * Nettoie les données temporaires d'authentification (sessionStorage)
   * Inclut: tokens 2FA temporaires, données de vérification en cours
   *
   * CRITIQUE: Doit être appelé:
   * - À chaque logout
   * - Après une vérification 2FA réussie
   * - En cas d'échec/annulation du flow 2FA
   */
  clearTemporaryAuthData(): void {
    if (typeof window === 'undefined') return;

    if (process.env.NODE_ENV === 'development') {
      console.log('[AUTH_MANAGER] Clearing temporary auth data (sessionStorage)...');
    }

    // Nettoyer les tokens temporaires 2FA
    this.safeRemoveSessionItem(SESSION_STORAGE_KEYS.TWO_FACTOR_TEMP_TOKEN);
    this.safeRemoveSessionItem(SESSION_STORAGE_KEYS.TWO_FACTOR_USER_ID);
    this.safeRemoveSessionItem(SESSION_STORAGE_KEYS.TWO_FACTOR_USERNAME);

    if (process.env.NODE_ENV === 'development') {
      console.log('[AUTH_MANAGER] Temporary auth data cleared');
    }
  }

  // ==================== UTILS ====================

  /**
   * Vérifie si un token JWT est valide (format)
   */
  isValidJWTFormat(token: string): boolean {
    if (!token || typeof token !== 'string') {
      return false;
    }

    // Un JWT valide doit avoir 3 parties séparées par des points
    const parts = token.split('.');
    if (parts.length !== 3) {
      return false;
    }

    // Chaque partie doit être une chaîne base64 valide
    try {
      parts.forEach(part => {
        if (!part || part.length === 0) {
          throw new Error('Empty part');
        }
        // Décoder pour vérifier que c'est du base64 valide
        atob(part.replace(/-/g, '+').replace(/_/g, '/'));
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Décode un token JWT (sans vérifier la signature)
   * ATTENTION: Ne pas utiliser pour des vérifications de sécurité
   */
  decodeJWT(token: string): any | null {
    try {
      const payload = token.split('.')[1];
      return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    } catch (error) {
      console.error('[AUTH_MANAGER] Error decoding JWT:', error);
      return null;
    }
  }

  /**
   * Vérifie si un token JWT est expiré
   */
  isTokenExpired(token: string): boolean {
    const payload = this.decodeJWT(token);
    if (!payload || !payload.exp) return true;

    const now = Math.floor(Date.now() / 1000);
    return payload.exp < now;
  }
}

// Export de l'instance singleton
export const authManager = AuthManager.getInstance();
