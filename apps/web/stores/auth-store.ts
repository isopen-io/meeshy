/**
 * Auth Store - Pure Zustand implementation with automatic persistence
 *
 * RÈGLE: Ce store ne doit JAMAIS accéder directement à localStorage
 * pour des clés legacy. Il utilise uniquement le persist Zustand.
 *
 * Pour accéder aux credentials: utiliser AuthManager (auth-manager.service.ts)
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type { User } from '@meeshy/shared/types';
import { AUTH_STORAGE_KEYS, authManager } from '@/services/auth-manager.service';
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isAuthChecking: boolean;
  authToken: string | null;
  refreshToken: string | null;
  sessionToken: string | null; // Token de session pour "Se souvenir de l'appareil"
  sessionExpiry: Date | null;
}

interface AuthActions {
  setUser: (user: User | null) => void;
  setAuthChecking: (checking: boolean) => void;
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
  refreshToken: null,
  sessionToken: null,
  sessionExpiry: null,
};

export const useAuthStore = create<AuthStore>()(
  devtools(
    persist(
      (set, get) => ({
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
            refreshToken: refreshToken || get().refreshToken,
            sessionToken: sessionToken || get().sessionToken,
            sessionExpiry,
          });
        },

        clearAuth: () => {
          // 1. Reset state Zustand
          set({
            user: null,
            isAuthenticated: false,
            authToken: null,
            refreshToken: null,
            sessionToken: null,
            sessionExpiry: null,
            isAuthChecking: false,
          });

          // 2. CRITIQUE: Supprimer explicitement localStorage persist
          // Support: SSR, iframes, WAP browsers
          if (typeof window !== 'undefined' && window.localStorage) {
            try {
              localStorage.removeItem(AUTH_STORAGE_KEYS.ZUSTAND_AUTH);
            } catch (error) {
              // Silently fail in case localStorage is disabled (private mode, iframe restrictions)
              console.warn('[AUTH_STORE] Could not clear localStorage:', error);
            }
          }

          if (process.env.NODE_ENV === 'development') {
          }
        },

        logout: async () => {

          // NOUVEAU: Utiliser AuthManager pour nettoyage centralisé
          // Import dynamique pour éviter circular deps
          const { authManager } = await import('../services/auth-manager.service');
          authManager.clearAllSessions();

          // Reset user preferences store
          const { resetUserPreferences } = await import('./user-preferences-store');
          resetUserPreferences();

          // Redirect to home page
          if (typeof window !== 'undefined') {
            // Petit délai pour s'assurer que tout est nettoyé
            setTimeout(() => {
              window.location.href = '/';
            }, 100);
          }
        },

        refreshSession: async (): Promise<boolean> => {
          const { refreshToken, authToken } = get();
          
          if (!refreshToken && !authToken) {
            return false;
          }

          try {
            const response = await fetch('/api/auth/refresh', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
              },
              body: JSON.stringify({ refreshToken }),
            });

            if (response.ok) {
              const data = await response.json();
              get().setTokens(data.accessToken, data.refreshToken, data.expiresIn);
              return true;
            }

            return false;
          } catch (error) {
            console.error('[AUTH_STORE] Session refresh failed:', error);
            return false;
          }
        },

        initializeAuth: async () => {
          set({ isAuthChecking: true });

          try {
            const { authToken, refreshToken, sessionExpiry, user } = get();

            if (process.env.NODE_ENV === 'development') {
            }

            if (authToken && user) {
              // Check if session is expired
              if (sessionExpiry && sessionExpiry < new Date()) {
                if (process.env.NODE_ENV === 'development') {
                }
                
                const refreshed = await get().refreshSession();
                if (!refreshed) {
                  if (process.env.NODE_ENV === 'development') {
                  }
                  get().clearAuth();
                  return;
                }
              }

              if (process.env.NODE_ENV === 'development') {
              }
              set({ isAuthenticated: true });
            } else {
              set({ isAuthenticated: false });
            }
          } catch (error) {
            console.error('[AUTH_STORE] Initialization error:', error);
            get().clearAuth();
          } finally {
            set({ isAuthChecking: false });
          }
        },
      }),
      {
        name: 'meeshy-auth',
        partialize: (state) => ({
          user: state.user,
          authToken: state.authToken,
          refreshToken: state.refreshToken,
          sessionToken: state.sessionToken,
          sessionExpiry: state.sessionExpiry,
        }),
      }
    ),
    { name: 'AuthStore' }
  )
);

// Selector hooks for better performance
export const useUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useIsAuthChecking = () => useAuthStore((state) => state.isAuthChecking);

// Use useShallow to prevent infinite loops when selecting multiple actions
export const useAuthActions = () => useAuthStore(
  useShallow((state) => ({
    setUser: state.setUser,
    logout: state.logout,
    setTokens: state.setTokens,
    clearAuth: state.clearAuth,
  }))
);
