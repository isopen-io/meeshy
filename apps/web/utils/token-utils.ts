/**
 * Utilitaires pour la gestion des tokens d'authentification
 */

import { authManager } from '@/services/auth-manager.service';

export interface TokenInfo {
  value: string;
  type: 'auth' | 'anonymous';
  header: {
    name: string;
    value: string;
  };
}

/**
 * Récupère le token d'authentification actuel (auth ou anonymous)
 */
export function getAuthToken(): TokenInfo | null {
  if (typeof window === 'undefined') {
    return null;
  }

  // Priorité 1: Token d'authentification normale
  const authToken = authManager.getAuthToken();
  if (authToken) {
    return {
      value: authToken,
      type: 'auth',
      header: {
        name: 'Authorization',
        value: `Bearer ${authToken}`
      }
    };
  }

  // Priorité 2: Token de session anonyme via authManager (source unique)
  const anonymousSession = authManager.getAnonymousSession();
  const sessionToken = anonymousSession?.token;
  if (sessionToken) {
    return {
      value: sessionToken,
      type: 'anonymous',
      header: {
        name: 'X-Session-Token',
        value: sessionToken
      }
    };
  }

  return null;
}

/**
 * Détermine le type d'un token donné
 */
export function getTokenType(token: string): 'auth' | 'anonymous' | null {
  if (!token) return null;

  // Vérifier si c'est un token anonyme via authManager (source unique)
  const sessionToken = typeof window !== 'undefined'
    ? authManager.getAnonymousSession()?.token
    : null;
  
  if (sessionToken === token) {
    return 'anonymous';
  }

  // Vérifier si c'est un token d'authentification
  const authToken = typeof window !== 'undefined' 
    ? authManager.getAuthToken() 
    : null;
  
  if (authToken === token) {
    return 'auth';
  }

  // Par défaut, on assume que c'est un token d'authentification normale (JWT)
  // car les tokens anonymes sont toujours stockés dans localStorage
  return 'auth';
}

/**
 * Crée les headers d'authentification appropriés pour un token
 */
export function createAuthHeaders(token?: string): HeadersInit {
  if (!token) {
    const tokenInfo = getAuthToken();
    if (!tokenInfo) return {};
    
    return {
      [tokenInfo.header.name]: tokenInfo.header.value
    };
  }

  const tokenType = getTokenType(token);
  
  if (tokenType === 'anonymous') {
    return {
      'X-Session-Token': token
    };
  }

  return {
    'Authorization': `Bearer ${token}`
  };
}

/**
 * Vérifie si l'utilisateur actuel est authentifié (auth ou anonymous)
 */
export function isAuthenticated(): boolean {
  return getAuthToken() !== null;
}

/**
 * Vérifie si l'utilisateur actuel est anonyme
 */
export function isAnonymousUser(): boolean {
  const tokenInfo = getAuthToken();
  return tokenInfo?.type === 'anonymous';
}

