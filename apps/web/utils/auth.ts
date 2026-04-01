import { User } from '@/types';
import { buildApiUrl } from '@/lib/config';
import { authManager } from '@/services/auth-manager.service';

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  isChecking: boolean;
  isAnonymous: boolean;
}

/**
 * Valide le format d'un token JWT
 */
export function isValidJWTFormat(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }

  try {
    parts.forEach(part => {
      if (!part || part.length === 0) {
        throw new Error('Empty part');
      }
      atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Vérifie si un token JWT est expiré (avec marge de 30s)
 */
export function isJWTExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.exp) return false;
    return payload.exp * 1000 < Date.now() - 30_000;
  } catch {
    return true;
  }
}

/**
 * Vérifie si un utilisateur est anonyme
 */
export function isUserAnonymous(user: User | null): boolean {
  if (!user) return false;
  
  const hasAnonymousProperties = user.hasOwnProperty('sessionToken') ||
                                user.hasOwnProperty('shareLinkId') ||
                                user.hasOwnProperty('isAnonymous');

  const anonymousSession = authManager.getAnonymousSession();
  const hasAnonymousToken = !!anonymousSession?.token;
  
  const hasAnonymousId = !!(user.id && (
    user.id.startsWith('anon_') || 
    user.id.includes('anonymous') ||
    user.id.length > 20
  ));
  
  return hasAnonymousProperties || hasAnonymousToken || hasAnonymousId;
}

/**
 * Vérifie si l'utilisateur actuel est anonyme
 */
export function isCurrentUserAnonymous(): boolean {
  const user = authManager.getCurrentUser();
  const anonymousSession = authManager.getAnonymousSession();

  if (anonymousSession?.token) return true;

  if (user) {
    return isUserAnonymous(user);
  }
  
  return false;
}

/**
 * Vérifie si l'utilisateur est authentifié avec un token valide
 */
export async function checkAuthStatus(): Promise<AuthState> {
  const token = authManager.getAuthToken();
  const anonymousSession = authManager.getAnonymousSession();
  const anonymousToken = anonymousSession?.token;

  if (token) {
    try {
      const response = await fetch(buildApiUrl('/auth/me'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        
        let userData;
        if (result.success && result.data?.user) {
          userData = result.data.user;
        } else if (result.user) {
          userData = result.user;
        } else if (result.id) {
          userData = result;
        } else {
          throw new Error('Format de réponse utilisateur invalide');
        }

        if (userData && userData.id) {
          return {
            isAuthenticated: true,
            user: userData,
            token,
            isChecking: false,
            isAnonymous: false
          };
        } else {
          throw new Error('Données utilisateur incomplètes');
        }
      }
      
      return {
        isAuthenticated: false,
        user: null,
        token: null,
        isChecking: false,
        isAnonymous: false
      };
    } catch (error) {
      console.error('[AUTH_UTILS] Erreur vérification auth:', error);
      return {
        isAuthenticated: false,
        user: null,
        token: null,
        isChecking: false,
        isAnonymous: false
      };
    }
  }
  
  if (anonymousToken) {
    try {
      const response = await fetch(buildApiUrl('/anonymous/refresh'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sessionToken: anonymousToken })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          return {
            isAuthenticated: true,
            user: result.data.participant,
            token: anonymousToken,
            isChecking: false,
            isAnonymous: true
          };
        }
      }
      
      return {
        isAuthenticated: false,
        user: null,
        token: null,
        isChecking: false,
        isAnonymous: false
      };
    } catch (error) {
      console.error('Erreur vérification session anonyme:', error);
      return {
        isAuthenticated: false,
        user: null,
        token: null,
        isChecking: false,
        isAnonymous: false
      };
    }
  }
  
  return {
    isAuthenticated: false,
    user: null,
    token: null,
    isChecking: false,
    isAnonymous: false
  };
}

/**
 * Nettoie toutes les données d'authentification
 */
export function clearAuthData(): void {
  authManager.clearAllSessions();
}

/**
 * Nettoie les données de session anonyme
 */
export function clearAnonymousData(): void {
  authManager.clearAnonymousSessions();
}

/**
 * Nettoie toutes les données d'authentification (normale + anonyme)
 */
export function clearAllAuthData(): void {
  authManager.clearAllSessions();
}

/**
 * Vérifie si l'utilisateur a accès à une route protégée
 */
export function canAccessProtectedRoute(authState: AuthState): boolean {
  return authState.isAuthenticated && !authState.isChecking;
}

/**
 * Vérifie si l'utilisateur peut accéder à une conversation partagée
 */
export function canAccessSharedConversation(authState: AuthState): boolean {
  return (authState.isAuthenticated || authState.isAnonymous) && !authState.isChecking;
}

/**
 * Redirige vers la page d'authentification appropriée
 */
export function redirectToAuth(returnUrl?: string): void {
  if (typeof window !== 'undefined') {
    const url = returnUrl ? `/login?returnUrl=${encodeURIComponent(returnUrl)}` : '/login';
    window.location.href = url;
  }
}

/**
 * Redirige vers la page d'accueil
 */
export function redirectToHome(): void {
  if (typeof window !== 'undefined') {
    window.location.href = '/';
  }
}
