import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Password Reset Store
 * Manages state for password reset flow (email and phone)
 */

// Masked user info for phone reset identity verification
export interface MaskedUserInfo {
  displayName: string;
  username: string;
  email: string;
  avatarUrl?: string;
}

// Phone reset flow steps
export type PhoneResetStep = 'phone_input' | 'identity_verification' | 'code_entry' | 'completed';

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

  // ========== Phone Reset State ==========
  // Current step in phone reset flow
  phoneResetStep: PhoneResetStep;
  // Phone number entered by user
  phoneNumber: string;
  // ISO 3166-1 alpha-2 country code
  phoneCountryCode: string;
  // Token ID from phone lookup
  phoneResetTokenId: string;
  // Masked user info from backend
  maskedUserInfo: MaskedUserInfo | null;
  // Loading states for phone reset
  isPhoneLookupLoading: boolean;
  isIdentityVerifying: boolean;
  isCodeVerifying: boolean;
  // Attempts remaining for identity verification
  identityAttemptsRemaining: number | null;

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

  // Phone reset actions
  setPhoneResetStep: (step: PhoneResetStep) => void;
  setPhoneNumber: (phone: string) => void;
  setPhoneCountryCode: (code: string) => void;
  setPhoneResetTokenId: (tokenId: string) => void;
  setMaskedUserInfo: (info: MaskedUserInfo | null) => void;
  setIsPhoneLookupLoading: (loading: boolean) => void;
  setIsIdentityVerifying: (loading: boolean) => void;
  setIsCodeVerifying: (loading: boolean) => void;
  setIdentityAttemptsRemaining: (attempts: number | null) => void;
  resetPhoneFlow: () => void;
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
  // Phone reset initial state
  phoneResetStep: 'phone_input' as PhoneResetStep,
  phoneNumber: '',
  phoneCountryCode: '',
  phoneResetTokenId: '',
  maskedUserInfo: null as MaskedUserInfo | null,
  isPhoneLookupLoading: false,
  isIdentityVerifying: false,
  isCodeVerifying: false,
  identityAttemptsRemaining: null as number | null,
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

      // Phone reset actions
      setPhoneResetStep: (phoneResetStep) => set({ phoneResetStep }),

      setPhoneNumber: (phoneNumber) => set({ phoneNumber }),

      setPhoneCountryCode: (phoneCountryCode) => set({ phoneCountryCode }),

      setPhoneResetTokenId: (phoneResetTokenId) => set({ phoneResetTokenId }),

      setMaskedUserInfo: (maskedUserInfo) => set({ maskedUserInfo }),

      setIsPhoneLookupLoading: (isPhoneLookupLoading) => set({ isPhoneLookupLoading }),

      setIsIdentityVerifying: (isIdentityVerifying) => set({ isIdentityVerifying }),

      setIsCodeVerifying: (isCodeVerifying) => set({ isCodeVerifying }),

      setIdentityAttemptsRemaining: (identityAttemptsRemaining) => set({ identityAttemptsRemaining }),

      resetPhoneFlow: () =>
        set({
          phoneResetStep: 'phone_input',
          phoneNumber: '',
          phoneCountryCode: '',
          phoneResetTokenId: '',
          maskedUserInfo: null,
          isPhoneLookupLoading: false,
          isIdentityVerifying: false,
          isCodeVerifying: false,
          identityAttemptsRemaining: null,
          error: null,
        }),
    }),
    {
      name: 'password-reset-storage',
      // Persist email, phone reset state, and resetRequested to allow user to return to flow
      partialize: (state) => ({
        // Email flow persistence
        email: state.email,
        resetRequested: state.resetRequested,
        // Phone flow persistence (allows resuming after page refresh)
        phoneResetStep: state.phoneResetStep,
        phoneNumber: state.phoneNumber,
        phoneCountryCode: state.phoneCountryCode,
        phoneResetTokenId: state.phoneResetTokenId,
        maskedUserInfo: state.maskedUserInfo,
      }),
    }
  )
);
