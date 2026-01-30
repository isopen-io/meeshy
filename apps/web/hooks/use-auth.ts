'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { User } from '@/types';
import {
  AuthState,
  checkAuthStatus,
  canAccessProtectedRoute,
  canAccessSharedConversation,
  redirectToAuth,
  redirectToHome,
  clearAllAuthData
} from '@/utils/auth';
import { useUser, useAuthActions, useIsAuthChecking } from '@/stores';
import { authManager } from '@/services/auth-manager.service';

// Fonction helper pour les logs de développement
const devLog = (message: string, ...args: any[]) => {
  if (process.env.NODE_ENV === 'development') {
  }
};

// Cache global pour éviter les vérifications d'authentification multiples
const authCache = {
  lastCheck: 0,
  cacheDuration: 300000, // 5 minutes (au lieu de 5 secondes)
  result: null as AuthState | null
};

/**
 * Fonction utilitaire pour invalider le cache d'authentification
 * À utiliser après une mise à jour des données utilisateur (ex: vérification email)
 */
export function invalidateAuthCache() {
  authCache.result = null;
  authCache.lastCheck = 0;
  if (process.env.NODE_ENV === 'development') {
    console.log('[USE_AUTH] Cache d\'authentification invalidé');
  }
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
      if (process.env.NODE_ENV === 'development') {
        devLog('[USE_AUTH] Utilisation du cache d\'authentification');
      }
      setAuthState(authCache.result);
      
      // Synchroniser avec le contexte global
      if (authCache.result.isAuthenticated && authCache.result.user) {
        setUserRef.current(authCache.result.user);
      } else {
        setUserRef.current(null);
      }
      
      return authCache.result;
    }
    
    if (process.env.NODE_ENV === 'development') {
      devLog('[USE_AUTH] Début de la vérification d\'authentification');
    }
    setAuthState(prev => ({ ...prev, isChecking: true }));
    
    try {
      const newAuthState = await checkAuthStatus();
      
      if (process.env.NODE_ENV === 'development') {
        devLog('[USE_AUTH] État d\'authentification:', newAuthState);
      }
      
      // Mettre à jour le cache
      authCache.result = newAuthState;
      authCache.lastCheck = now;
      
      // Synchroniser avec le contexte global
      if (newAuthState.isAuthenticated && newAuthState.user) {
        setUserRef.current(newAuthState.user);
      } else {
        setUserRef.current(null);
      }
      
      setAuthState(newAuthState);
      return newAuthState;
    } catch (error) {
      console.error('[USE_AUTH] Erreur lors de la vérification d\'authentification:', error);
      const errorState: AuthState = {
        isAuthenticated: false,
        user: null,
        token: null,
        isChecking: false,
        isAnonymous: false
      };
      
      // Mettre à jour le cache avec l'état d'erreur
      authCache.result = errorState;
      authCache.lastCheck = now;
      
      setAuthState(errorState);
      setUserRef.current(null);
      return errorState;
    }
  }, []);

  // Initialiser l'authentification au chargement (une seule fois)
  useEffect(() => {
    if (hasInitialized.current) {
      return;
    }
    hasInitialized.current = true;
    checkAuth();
  }, []);

  // Gestion des redirections unifiée et simplifiée
  useEffect(() => {
    // Éviter les redirections multiples
    if (redirectInProgress.current) {
      return;
    }

    // Ne pas faire de vérifications si l'authentification est en cours
    if (authState.isChecking || isAuthChecking) {
      devLog('[USE_AUTH] Vérification en cours, pas de redirection');
      return;
    }

    // Routes publiques statiques (pas de vérification nécessaire)
    const publicRoutes = [
      '/',
      '/login',
      '/signup',
      '/register',
      '/partners',
      '/privacy',
      '/contact',
      '/about',
      '/terms',
      '/forgot-password',
      '/forgot-password/check-email',
      '/reset-password',
      '/auth-status'
    ];
    const isPublicRoute = publicRoutes.includes(pathname) || pathname.startsWith('/v2');

    // Routes d'authentification publiques (patterns dynamiques)
    const isAuthRoute = pathname.startsWith('/auth/'); // /auth/verify-email, /auth/verify-phone, /auth/magic-link, /auth/verify-2fa, etc.

    // Routes de tracking (/l/[token]) - PUBLIQUES, accessibles à tous
    const isTrackingRoute = pathname.startsWith('/l/') || pathname.startsWith('/links/tracked/');

    // Routes d'affiliation (/signup/affiliate/[token]) - PUBLIQUES
    const isAffiliateRoute = pathname.startsWith('/signup/affiliate/');

    // Routes de jointure (accessibles sans authentification)
    const isJoinRoute = pathname.startsWith('/join/');

    // Routes de chat partagé (nécessitent une session active)
    const isSharedChatRoute = pathname.startsWith('/chat/');

    if (isPublicRoute || isAuthRoute || isAffiliateRoute) {
      // Route publique, pas de vérification
      devLog('[USE_AUTH] Route publique, pas de redirection automatique');
      return;
    }

    if (isTrackingRoute) {
      // Route de tracking, accessible à tous sans authentification
      devLog('[USE_AUTH] Route de tracking, pas de redirection');
      return;
    }

    if (isJoinRoute) {
      // Route de jointure, accessible à tous
      return;
    }
    
    if (isSharedChatRoute) {
      // Route de chat partagé, nécessite une session active
      // Vérifier si l'utilisateur vient juste de se connecter en anonyme
      const justJoined = localStorage.getItem('anonymous_just_joined');
      if (justJoined) {
        devLog('[USE_AUTH] Utilisateur vient de se connecter en anonyme, pas de redirection');
        return;
      }
      
      // Validation améliorée pour les sessions anonymes
      if (authState.isAnonymous) {
        const anonymousSession = authManager.getAnonymousSession();
        const sessionToken = anonymousSession?.token;
        const participant = localStorage.getItem('anonymous_participant');

        if (!sessionToken || !participant) {
          devLog('[USE_AUTH] Session anonyme incomplète, redirection vers join');
          const storedLinkId = localStorage.getItem('anonymous_current_link_id');
          if (storedLinkId) {
            redirectInProgress.current = true;
            router.push(`/join/${storedLinkId}`);
          } else {
            redirectInProgress.current = true;
            redirectToHome();
          }
          return;
        }
        
        // Vérifier que les données du participant sont valides
        try {
          const participantData = JSON.parse(participant);
          if (!participantData.id || !participantData.username) {
            devLog('[USE_AUTH] Données participant invalides, redirection vers join');
            const storedLinkId = localStorage.getItem('anonymous_current_link_id');
            if (storedLinkId) {
              redirectInProgress.current = true;
              router.push(`/join/${storedLinkId}`);
            } else {
              redirectInProgress.current = true;
              redirectToHome();
            }
            return;
          }
        } catch (e) {
          console.error('[USE_AUTH] Erreur parsing participant:', e);
          const storedLinkId = localStorage.getItem('anonymous_current_link_id');
          if (storedLinkId) {
            redirectInProgress.current = true;
            router.push(`/join/${storedLinkId}`);
          } else {
            redirectInProgress.current = true;
            redirectToHome();
          }
          return;
        }
      }
      
      if (!canAccessSharedConversation(authState)) {
        // Pour les routes de chat partagé, nous devons utiliser le linkId original stocké
        const storedLinkId = localStorage.getItem('anonymous_current_link_id');
        
        if (storedLinkId) {
          devLog('[USE_AUTH] Redirection vers join avec linkId original:', storedLinkId);
          redirectInProgress.current = true;
          router.push(`/join/${storedLinkId}`);
        } else {
          devLog('[USE_AUTH] Pas de linkId original stocké, redirection vers home');
          redirectInProgress.current = true;
          redirectToHome();
        }
        return;
      }
    }
    
    // Routes protégées (nécessitent une authentification complète)
    if (!canAccessProtectedRoute(authState)) {
      // Nettoyer les données d'authentification invalides avant la redirection
      if (authState.token && !authState.isAuthenticated) {
        devLog('[USE_AUTH] Nettoyage des données d\'authentification invalides');
        clearAllAuthData();
        // Mettre à jour l'état pour refléter le nettoyage
        setAuthState({
          isAuthenticated: false,
          user: null,
          token: null,
          isChecking: false,
          isAnonymous: false
        });
        setUserRef.current(null);
      }
      
      // Éviter la redirection si on est déjà sur /login
      if (pathname === '/login') {
        devLog('[USE_AUTH] Déjà sur /login, pas de redirection');
        return;
      }
      
      // Sauvegarder l'URL actuelle pour redirection après connexion
      const returnUrl = pathname !== '/' ? pathname : undefined;
      const loginUrl = returnUrl ? `/login?returnUrl=${encodeURIComponent(returnUrl)}` : '/login';
      devLog('[USE_AUTH] Redirection vers login car non authentifié. Auth state:', authState);
      redirectInProgress.current = true;
      router.push(loginUrl);
      return;
    }
  }, [authState.isAuthenticated, authState.isChecking, pathname, isAuthChecking]);

  // Se connecter
  const login = useCallback((user: User, token: string, sessionToken?: string, expiresIn?: number) => {
    devLog('[USE_AUTH] Connexion utilisateur:', user.username, '| sessionToken:', !!sessionToken, '| expiresIn:', expiresIn);

    // NOUVEAU: Utiliser AuthManager (source unique)
    // Nettoie automatiquement les sessions précédentes
    authManager.setCredentials(user, token, undefined, sessionToken, expiresIn);

    // CRITIQUE: Mettre à jour le store Zustand persisté
    setUserRef.current(user);
    setTokensRef.current(token, undefined, sessionToken, expiresIn);

    // Mettre à jour l'état immédiatement de manière synchrone
    const newAuthState = {
      isAuthenticated: true,
      user,
      token,
      isChecking: false,
      isAnonymous: false
    };

    // CRITIQUE: Mettre à jour le cache aussi pour éviter les bugs de vérification
    authCache.result = newAuthState;
    authCache.lastCheck = Date.now();

    // Force immediate state update
    setAuthState(newAuthState);

    devLog('[USE_AUTH] État mis à jour immédiatement:', newAuthState);
  }, []);

  // Se déconnecter
  const logout = useCallback(() => {
    devLog('[USE_AUTH] Déconnexion utilisateur');

    clearAllAuthData();
    const newAuthState = {
      isAuthenticated: false,
      user: null,
      token: null,
      isChecking: false,
      isAnonymous: false
    };

    // CRITIQUE: Mettre à jour le cache aussi pour éviter les bugs
    authCache.result = newAuthState;
    authCache.lastCheck = Date.now();

    setAuthState(newAuthState);
    setUserRef.current(null);

    // Utiliser window.location.href pour forcer un rechargement complet
    // Cela garantit que l'état d'authentification est correctement réinitialisé
    window.location.href = '/';
  }, []);

  // Rejoindre une conversation anonymement
  const joinAnonymously = useCallback((participant: any, sessionToken: string, conversationShareLinkId?: string) => {
    devLog('[USE_AUTH] Création de session anonyme:', {
      participantId: participant.id,
      username: participant.username,
      conversationShareLinkId,
      sessionTokenLength: sessionToken.length
    });

    // NOUVEAU: Utiliser AuthManager pour les sessions anonymes
    authManager.setAnonymousSession(sessionToken, participant.id, 24); // 24h d'expiration

    // Stocker les données du participant et du lien dans localStorage temporairement
    // (en attendant une migration complète vers authManager)
    if (typeof window !== 'undefined') {
      localStorage.setItem('anonymous_participant', JSON.stringify(participant));
      if (conversationShareLinkId) {
        localStorage.setItem('anonymous_current_share_link', conversationShareLinkId);
      }

      // Marquer une connexion anonyme récente
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

    // CRITIQUE: Mettre à jour le cache aussi
    authCache.result = newAuthState;
    authCache.lastCheck = Date.now();

    setAuthState(newAuthState);
    setUserRef.current(participant);

    devLog('[USE_AUTH] Session anonyme créée avec succès');
  }, []);

  // Quitter une session anonyme
  const leaveAnonymousSession = useCallback(() => {
    devLog('[USE_AUTH] Fermeture de session anonyme');

    // CORRECTION CRITIQUE: Utiliser AuthManager pour nettoyer TOUTES les sessions
    // Cela garantit que toutes les données (anonymes ET non-anonymes) sont nettoyées
    authManager.clearAllSessions();

    const newAuthState = {
      isAuthenticated: false,
      user: null,
      token: null,
      isChecking: false,
      isAnonymous: false
    };

    // CRITIQUE: Mettre à jour le cache aussi
    authCache.result = newAuthState;
    authCache.lastCheck = Date.now();

    setAuthState(newAuthState);
    setUserRef.current(null);

    devLog('[USE_AUTH] Session anonyme fermée avec succès');
  }, []);

  // Rafraîchir l'état d'authentification
  const refreshAuth = useCallback(async () => {
    return await checkAuth();
  }, [checkAuth]);

  // Forcer le nettoyage des données d'authentification invalides
  const forceLogout = useCallback(() => {
    devLog('[USE_AUTH] Nettoyage forcé des données d\'authentification');
    clearAllAuthData();
    const newAuthState = {
      isAuthenticated: false,
      user: null,
      token: null,
      isChecking: false,
      isAnonymous: false
    };

    // CRITIQUE: Mettre à jour le cache aussi
    authCache.result = newAuthState;
    authCache.lastCheck = Date.now();

    setAuthState(newAuthState);
    setUserRef.current(null);
  }, []);

  return {
    // État
    isAuthenticated: authState.isAuthenticated,
    user: authState.user,
    token: authState.token,
    isChecking: authState.isChecking || isAuthChecking,
    isAnonymous: authState.isAnonymous,
    
    // Méthodes
    login,
    logout,
    joinAnonymously,
    leaveAnonymousSession,
    refreshAuth,
    checkAuth,
    forceLogout
  };
}
