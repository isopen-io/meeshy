/**
 * Auth Store - Pure Zustand implementation with automatic persistence
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type { User } from '@meeshy/shared/types';
import { AUTH_STORAGE_KEYS } from '@/constants/auth';
import { authManager } from '@/services/auth-manager.service';
import { authService } from '@/services/auth.service';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isAuthChecking: boolean;
  authToken: string | null;
  sessionToken: string | null;
  sessionExpiry: Date | null;
}

interface AuthActions {
  setUser: (user: User | null) => void;
  setAuthChecking: (checking: boolean) => void;
  // `refreshToken` (2e créneau) n'a plus de contrepartie en état réactif
  // (#4405, étape 3) : son accesseur sur AuthManager a été retiré — rien ne
  // produit jamais de valeur pour ce créneau (mesuré, aucune route
  // d'authentification du gateway ne rend ce champ). Le paramètre reste
  // ACCEPTÉ, à sa position : `hooks/use-auth.ts:175` (hors territoire de ce
  // lot) l'appelle encore positionnellement.
  setTokens: (authToken: string, refreshToken?: string, sessionToken?: string, expiresIn?: number) => void;
  clearAuth: () => void;
  logout: () => void;
  initializeAuth: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

type AuthStore = AuthState & AuthActions;

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isAuthChecking: true,
  authToken: null,
  sessionToken: null,
  sessionExpiry: null,
};

export const useAuthStore = create<AuthStore>()(
  devtools(
    persist(
      (set, get) => {
        // Register cleanup with AuthManager
        /* istanbul ignore next */
        if (typeof window !== 'undefined') {
          authManager.registerOnClear(() => {
            set({
              user: null,
              isAuthenticated: false,
              authToken: null,
              sessionToken: null,
              sessionExpiry: null,
            });
          });
        }

        return {
          ...initialState,

          setUser: (user: User | null) => {
            set({
              user,
              isAuthenticated: !!user,
              isAuthChecking: false,
            });
          },

          setAuthChecking: (checking: boolean) => {
            set({ isAuthChecking: checking });
          },

          setTokens: (authToken: string, refreshToken?: string, sessionToken?: string, expiresIn?: number) => {
            const sessionExpiry = expiresIn
              ? new Date(Date.now() + expiresIn * 1000)
              : null;

            set({
              authToken,
              sessionToken: sessionToken || get().sessionToken,
              sessionExpiry,
            });
          },

          clearAuth: () => {
            set({
              user: null,
              isAuthenticated: false,
              authToken: null,
              sessionToken: null,
              sessionExpiry: null,
              isAuthChecking: false,
            });

            /* istanbul ignore next */
            if (typeof window !== 'undefined' && window.localStorage) {
              try {
                localStorage.removeItem(AUTH_STORAGE_KEYS.ZUSTAND_AUTH);
              } catch (error) {}
            }
          },

          logout: async () => {
            authManager.clearAllSessions();
            /* istanbul ignore next */
            if (typeof window !== 'undefined') {
              setTimeout(() => {
                window.location.href = '/';
              }, 100);
            }
          },

          refreshSession: async (): Promise<boolean> => {
            const { authToken, sessionToken } = get();

            // `token` (le JWT) est REQUIS par le schéma serveur de
            // /auth/refresh — un sessionToken seul, sans authToken, ne peut
            // jamais aboutir (voir authService.refreshToken).
            if (!authToken) return false;

            try {
              // Une SEULE source de vérité pour l'appel réseau :
              // authService.refreshToken() est déjà câblé sur
              // buildApiUrl(API_ENDPOINTS.auth.refresh) et porte le corps que
              // la route exige (`{ token, sessionToken }`). Le store ne
              // duplique plus de second `fetch`.
              const response = await authService.refreshToken(sessionToken);
              const refreshed = response.success ? response.data : undefined;

              if (!refreshed?.token) return false;

              get().setTokens(
                refreshed.token,
                undefined,
                refreshed.sessionToken,
                refreshed.expiresIn
              );

              return true;
            } catch (error) {
              return false;
            }
          },

          initializeAuth: async () => {
            set({ isAuthChecking: true });

            try {
              // 1. Sync from AuthManager (source of truth for primitives)
              const token = authManager.getAuthToken();
              const user = authManager.getCurrentUser();

              if (token && user) {
                set({
                  authToken: token,
                  user,
                  isAuthenticated: true,
                });
              } else {
                set({ isAuthenticated: false });
              }
            } catch (error) {
              set({ isAuthenticated: false });
            } finally {
              set({ isAuthChecking: false });
            }
          },
        };
      },
      {
        name: 'meeshy-auth',
        partialize: (state) => ({
          user: state.user,
          authToken: state.authToken,
          sessionToken: state.sessionToken,
          sessionExpiry: state.sessionExpiry,
        }),
      }
    ),
    { name: 'AuthStore' }
  )
);

export const useUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useIsAuthChecking = () => useAuthStore((state) => state.isAuthChecking);

export const useAuthActions = () => useAuthStore(
  useShallow((state) => ({
    setUser: state.setUser,
    logout: state.logout,
    setTokens: state.setTokens,
    clearAuth: state.clearAuth,
  }))
);
