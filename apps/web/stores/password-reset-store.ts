import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Password Reset Store
 * Manages state for password reset flow
 */

interface PasswordResetState {
  // Email used for password reset request
  email: string;

  // Reset token from email link
  token: string;

  // Loading states
  isRequestingReset: boolean;
  isResettingPassword: boolean;
  isVerifyingToken: boolean;

  // Error and success messages
  error: string | null;
  successMessage: string | null;

  // Whether user has successfully requested a reset
  resetRequested: boolean;

  // Whether password has been successfully reset
  passwordReset: boolean;

  // Whether 2FA is required for this reset
  requires2FA: boolean;

  // Actions
  setEmail: (email: string) => void;
  setToken: (token: string) => void;
  setError: (error: string | null) => void;
  setSuccessMessage: (message: string | null) => void;
  setIsRequestingReset: (loading: boolean) => void;
  setIsResettingPassword: (loading: boolean) => void;
  setIsVerifyingToken: (loading: boolean) => void;
  setResetRequested: (requested: boolean) => void;
  setPasswordReset: (reset: boolean) => void;
  setRequires2FA: (requires: boolean) => void;
  clearError: () => void;
  clearSuccess: () => void;
  reset: () => void;
}

const initialState = {
  email: '',
  token: '',
  isRequestingReset: false,
  isResettingPassword: false,
  isVerifyingToken: false,
  error: null,
  successMessage: null,
  resetRequested: false,
  passwordReset: false,
  requires2FA: false,
};

export const usePasswordResetStore = create<PasswordResetState>()(
  persist(
    (set) => ({
      ...initialState,

      setEmail: (email) => set({ email }),

      setToken: (token) => set({ token }),

      setError: (error) => set({ error, successMessage: null }),

      setSuccessMessage: (successMessage) => set({ successMessage, error: null }),

      setIsRequestingReset: (isRequestingReset) => set({ isRequestingReset }),

      setIsResettingPassword: (isResettingPassword) => set({ isResettingPassword }),

      setIsVerifyingToken: (isVerifyingToken) => set({ isVerifyingToken }),

      setResetRequested: (resetRequested) => set({ resetRequested }),

      setPasswordReset: (passwordReset) => set({ passwordReset }),

      setRequires2FA: (requires2FA) => set({ requires2FA }),

      clearError: () => set({ error: null }),

      clearSuccess: () => set({ successMessage: null }),

      reset: () => set(initialState),
    }),
    {
      name: 'password-reset-storage',
      // Only persist email and resetRequested to allow user to return to flow
      partialize: (state) => ({
        email: state.email,
        resetRequested: state.resetRequested,
      }),
    }
  )
);
