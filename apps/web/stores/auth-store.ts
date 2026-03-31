/**
 * Auth Store - Pure Zustand implementation with automatic persistence
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import type { User } from '@meeshy/shared/types';
import { AUTH_STORAGE_KEYS } from '@/constants/auth';
import { authManager } from '@/services/auth-manager.service';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isAuthChecking: boolean;
  authToken: string | null;
  refreshToken: string | null;
  sessionToken: string | null;
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
      (set, get) => {
        // Register cleanup with AuthManager
        if (typeof window !== 'undefined') {
          authManager.registerOnClear(() => {
            set({
              user: null,
              isAuthenticated: false,
              authToken: null,
              refreshToken: null,
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
              refreshToken: refreshToken || get().refreshToken,
              sessionToken: sessionToken || get().sessionToken,
              sessionExpiry,
            });
          },

          clearAuth: () => {
            set({
              user: null,
              isAuthenticated: false,
              authToken: null,
              refreshToken: null,
              sessionToken: null,
              sessionExpiry: null,
              isAuthChecking: false,
            });

            if (typeof window !== 'undefined' && window.localStorage) {
              try {
                localStorage.removeItem(AUTH_STORAGE_KEYS.ZUSTAND_AUTH);
              } catch (error) {}
            }
          },

          logout: async () => {
            authManager.clearAllSessions();
            if (typeof window !== 'undefined') {
              setTimeout(() => {
                window.location.href = '/';
              }, 100);
            }
          },

          refreshSession: async (): Promise<boolean> => {
            const { refreshToken, authToken } = get();

            if (!refreshToken && !authToken) return false;

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
                // Also update AuthManager
                authManager.updateTokens(data.accessToken, data.refreshToken, undefined, data.expiresIn);
                return true;
              }

              return false;
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
                  refreshToken: authManager.getRefreshToken()
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
          refreshToken: state.refreshToken,
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
