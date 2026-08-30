'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { User } from '@/types';
import {
  AuthState,
  checkAuthStatus,
  canAccessProtectedRoute,
  redirectToAuth,
  redirectToHome,
  clearAllAuthData
} from '@/utils/auth';
import { useUser, useAuthActions, useIsAuthChecking } from '@/stores';
import { authManager } from '@/services/auth-manager.service';
import { isPublicRoute, isSharedChatRoute } from '@/utils/route-utils';

/* istanbul ignore next */
const devLog = (message: string, ...args: any[]) => {
  if (process.env.NODE_ENV === 'development') {
    // console.log(message, ...args);
  }
};

// Cache global pour éviter les vérifications d'authentification multiples
const authCache = {
  lastCheck: 0,
  cacheDuration: 300000, // 5 minutes
  result: null as AuthState | null
};

/**
 * Fonction utilitaire pour invalider le cache d'authentification
 */
export function invalidateAuthCache() {
  authCache.result = null;
  authCache.lastCheck = 0;
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    token: null,
    isChecking: true,
    isAnonymous: false
  });
  
  const router = useRouter();
  const pathname = usePathname();
  const { setUser, setTokens } = useAuthActions();
  const isAuthChecking = useIsAuthChecking();
  const hasInitialized = useRef(false);
  const setUserRef = useRef(setUser);
  const setTokensRef = useRef(setTokens);
  const redirectInProgress = useRef(false);

  // Keep setUser and setTokens refs updated
  useEffect(() => {
    setUserRef.current = setUser;
    setTokensRef.current = setTokens;
  }, [setUser, setTokens]);

  // Vérifier l'état d'authentification avec cache
  const checkAuth = useCallback(async () => {
    const now = Date.now();
    
    // Utiliser le cache si récent
    if (authCache.result && (now - authCache.lastCheck) < authCache.cacheDuration) {
      setAuthState(authCache.result);
      if (authCache.result.isAuthenticated && authCache.result.user) {
        setUserRef.current(authCache.result.user);
      } else {
        setUserRef.current(null);
      }
      return authCache.result;
    }
    
    setAuthState(prev => ({ ...prev, isChecking: true }));
    
    try {
      const newAuthState = await checkAuthStatus();
      
      authCache.result = newAuthState;
      authCache.lastCheck = now;
      
      if (newAuthState.isAuthenticated && newAuthState.user) {
        setUserRef.current(newAuthState.user);
      } else {
        setUserRef.current(null);
      }
      
      setAuthState(newAuthState);
      return newAuthState;
    } catch (error) {
      const errorState: AuthState = {
        isAuthenticated: false,
        user: null,
        token: null,
        isChecking: false,
        isAnonymous: false
      };
      authCache.result = errorState;
      authCache.lastCheck = now;
      setAuthState(errorState);
      setUserRef.current(null);
      return errorState;
    }
  }, []);

  // Initialiser l'authentification au chargement
  useEffect(() => {
    /* istanbul ignore next */
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    checkAuth();
  }, [checkAuth]);

  // Gestion des redirections
  useEffect(() => {
    if (redirectInProgress.current) return;
    if (authState.isChecking || isAuthChecking) return;

    // 1. Si route publique, aucune redirection
    if (isPublicRoute(pathname)) {
      return;
    }

    // 2. Chat partagé : JAMAIS de redirection.
    //
    // `/chat/:sharedId` s'ouvre pour tout le monde — visiteur sans compte
    // inclus. C'est `SharedConversationExperience` qui décide quoi peindre
    // (vue complète, vue partagée vivante, ou aperçu + modale de jonction), et
    // il a besoin de la réponse du serveur pour trancher.
    //
    // Ce bloc renvoyait auparavant vers `/join/:storedLinkId` — l'ancienne
    // page d'accueil — dès qu'une session anonyme manquait. Comme `/join`
    // renvoyait à son tour sur `/chat`, les deux écrans se relançaient : la
    // boucle que trois gardes `sessionStorage` tentaient de contenir. Le
    // routeur n'a plus rien à décider ici.
    if (isSharedChatRoute(pathname)) {
      return;
    }
    
    // 3. Routes protégées
    if (!canAccessProtectedRoute(authState)) {
      if (authState.token && !authState.isAuthenticated) {
        clearAllAuthData();
        setAuthState({
          isAuthenticated: false,
          user: null,
          token: null,
          isChecking: false,
          isAnonymous: false
        });
        setUserRef.current(null);
      }
      
      /* istanbul ignore next */
      if (pathname === '/login') return;

      /* istanbul ignore next */
      const search = typeof window !== 'undefined' ? window.location.search : '';
      const fullPath = pathname !== '/' ? pathname + search : undefined;
      const loginUrl = fullPath ? `/login?returnUrl=${encodeURIComponent(fullPath)}` : '/login';

      redirectInProgress.current = true;
      router.push(loginUrl);
    }
  }, [authState.isAuthenticated, authState.isChecking, pathname, isAuthChecking, authState.token, authState.isAnonymous, router]);

  const login = useCallback((user: User, token: string, sessionToken?: string, expiresIn?: number) => {
    authManager.setCredentials({ user, authToken: token, sessionToken, expiresIn });
    setUserRef.current(user);
    setTokensRef.current({ authToken: token, sessionToken, expiresIn });

    const newAuthState = {
      isAuthenticated: true,
      user,
      token,
      isChecking: false,
      isAnonymous: false
    };

    authCache.result = newAuthState;
    authCache.lastCheck = Date.now();
    setAuthState(newAuthState);
  }, []);

  const logout = useCallback(() => {
    clearAllAuthData();
    const newAuthState = {
      isAuthenticated: false,
      user: null,
      token: null,
      isChecking: false,
      isAnonymous: false
    };
    authCache.result = newAuthState;
    authCache.lastCheck = Date.now();
    setAuthState(newAuthState);
    setUserRef.current(null);
    window.location.href = '/';
  }, []);

  const joinAnonymously = useCallback((participant: any, sessionToken: string, conversationShareLinkId?: string) => {
    authManager.setAnonymousSession(sessionToken, participant.id, 24);

    /* istanbul ignore else */
    if (typeof window !== 'undefined') {
      localStorage.setItem('anonymous_participant', JSON.stringify(participant));
      if (conversationShareLinkId) {
        localStorage.setItem('anonymous_current_share_link', conversationShareLinkId);
      }
      localStorage.setItem('anonymous_just_joined', 'true');
      setTimeout(() => {
        localStorage.removeItem('anonymous_just_joined');
      }, 3000);
    }

    const newAuthState = {
      isAuthenticated: true,
      user: participant,
      token: sessionToken,
      isChecking: false,
      isAnonymous: true
    };

    authCache.result = newAuthState;
    authCache.lastCheck = Date.now();
    setAuthState(newAuthState);
    setUserRef.current(participant);
  }, []);

  const leaveAnonymousSession = useCallback(() => {
    authManager.clearAllSessions();
    const newAuthState = {
      isAuthenticated: false,
      user: null,
      token: null,
      isChecking: false,
      isAnonymous: false
    };
    authCache.result = newAuthState;
    authCache.lastCheck = Date.now();
    setAuthState(newAuthState);
    setUserRef.current(null);
  }, []);

  const refreshAuth = useCallback(async () => {
    return await checkAuth();
  }, [checkAuth]);

  const forceLogout = useCallback(() => {
    clearAllAuthData();
    const newAuthState = {
      isAuthenticated: false,
      user: null,
      token: null,
      isChecking: false,
      isAnonymous: false
    };
    authCache.result = newAuthState;
    authCache.lastCheck = Date.now();
    setAuthState(newAuthState);
    setUserRef.current(null);
  }, []);

  return {
    isAuthenticated: authState.isAuthenticated,
    user: authState.user,
    token: authState.token,
    isChecking: authState.isChecking || isAuthChecking,
    isAnonymous: authState.isAnonymous,
    login,
    logout,
    joinAnonymously,
    leaveAnonymousSession,
    refreshAuth,
    checkAuth,
    forceLogout
  };
}
