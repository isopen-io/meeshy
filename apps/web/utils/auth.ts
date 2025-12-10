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
 * Vérifie si un utilisateur est anonyme
 */
export function isUserAnonymous(user: User | null): boolean {
  if (!user) return false;
  
  // Vérifier les propriétés spécifiques aux utilisateurs anonymes
  const hasAnonymousProperties = user.hasOwnProperty('sessionToken') ||
                                user.hasOwnProperty('shareLinkId') ||
                                user.hasOwnProperty('isAnonymous');

  // NOUVEAU: Vérifier via authManager au lieu de localStorage
  const anonymousSession = authManager.getAnonymousSession();
  const hasAnonymousToken = !!anonymousSession?.token;
  
  // Vérifier si l'utilisateur a un ID qui commence par des patterns anonymes
  const hasAnonymousId = !!(user.id && (
    user.id.startsWith('anon_') || 
    user.id.includes('anonymous') ||
    user.id.length > 20 // Les IDs anonymes sont généralement plus longs
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

  // getCurrentUser() retourne déjà un objet User, pas une chaîne JSON
  if (user) {
    return isUserAnonymous(user);
  }
  
  return false;
}

/**
 * Vérifie si l'utilisateur est authentifié avec un token valide
 */
export async function checkAuthStatus(): Promise<AuthState> {
  // NOUVEAU: Utiliser authManager au lieu de localStorage
  const token = authManager.getAuthToken();
  const anonymousSession = authManager.getAnonymousSession();
  const anonymousToken = anonymousSession?.token;
  const anonymousParticipant = typeof window !== 'undefined' ? localStorage.getItem('anonymous_participant') : null;

  if (process.env.NODE_ENV === 'development') {
  }
  
  // Si on a un token d'authentification normale
  if (token) {
    try {
      if (process.env.NODE_ENV === 'development') {
      }
      const response = await fetch(buildApiUrl('/auth/me'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (process.env.NODE_ENV === 'development') {
      }

      if (response.ok) {
        const result = await response.json();
        
        if (process.env.NODE_ENV === 'development') {
        }
        
        // Gérer différents formats de réponse
        let userData;
        if (result.success && result.data?.user) {
          // Format standardisé: { success: true, data: { user: {...} } }
          userData = result.data.user;
        } else if (result.user) {
          // Format direct: { user: {...} }
          userData = result.user;
        } else if (result.id) {
          // Format utilisateur direct: { id: ..., username: ..., ... }
          userData = result;
        } else {
          console.error('[AUTH_UTILS] Format de réponse inattendu:', result);
          throw new Error('Format de réponse utilisateur invalide');
        }

        if (userData && userData.id) {
          if (process.env.NODE_ENV === 'development') {
          }
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
      
      // Token invalide ou réponse incorrecte, nettoyer
      if (process.env.NODE_ENV === 'development') {
      }
      clearAuthData();
      return {
        isAuthenticated: false,
        user: null,
        token: null,
        isChecking: false,
        isAnonymous: false
      };
    } catch (error) {
      console.error('[AUTH_UTILS] Erreur vérification auth:', error);
      
      // En cas d'erreur, nettoyer toutes les données d'authentification
      clearAuthData();
      return {
        isAuthenticated: false,
        user: null,
        token: null,
        isChecking: false,
        isAnonymous: false
      };
    }
  }
  
  // Si on a un token anonyme
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
      
      // Token anonyme invalide, nettoyer
      clearAnonymousData();
      return {
        isAuthenticated: false,
        user: null,
        token: null,
        isChecking: false,
        isAnonymous: false
      };
    } catch (error) {
      console.error('Erreur vérification session anonyme:', error);
      clearAnonymousData();
      return {
        isAuthenticated: false,
        user: null,
        token: null,
        isChecking: false,
        isAnonymous: false
      };
    }
  }
  
  // Aucun token
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
 * @deprecated Utiliser authManager.clearAllSessions() à la place
 */
export function clearAuthData(): void {
  authManager.clearAllSessions();
}

/**
 * Nettoie les données de session anonyme
 * @deprecated Utiliser authManager.clearAnonymousSessions() à la place
 */
export function clearAnonymousData(): void {
  authManager.clearAnonymousSessions();
}

/**
 * Nettoie toutes les données d'authentification (normale + anonyme)
 * NOUVEAU: Délègue à authManager (source unique)
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
  // Pour les conversations partagées, on accepte les utilisateurs authentifiés ET les sessions anonymes
  return (authState.isAuthenticated || authState.isAnonymous) && !authState.isChecking;
}

/**
 * Redirige vers la page d'authentification appropriée
 * Note: Cette fonction est utilisée dans le hook useAuth qui gère la redirection via router
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
