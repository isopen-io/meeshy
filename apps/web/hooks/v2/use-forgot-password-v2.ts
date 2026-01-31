/**
 * Hook for V2 Forgot Password Flow
 *
 * Handles password reset request and password change.
 */

'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { passwordResetService } from '@/services/password-reset.service';

export interface ForgotPasswordState {
  email: string;
  isLoading: boolean;
  isSuccess: boolean;
  error: string | null;
}

export interface ResetPasswordState {
  newPassword: string;
  confirmPassword: string;
  isLoading: boolean;
  isSuccess: boolean;
  error: string | null;
  passwordStrength: number;
  passwordErrors: string[];
}

export interface UseForgotPasswordV2Return {
  // Request reset flow
  state: ForgotPasswordState;
  setEmail: (email: string) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;

  // Reset password flow (with token)
  resetState: ResetPasswordState;
  setNewPassword: (password: string) => void;
  setConfirmPassword: (password: string) => void;
  handleResetSubmit: (e: React.FormEvent) => Promise<void>;

  // Helpers
  getPasswordStrengthLabel: () => string;
  getPasswordStrengthColor: () => string;
}

export function useForgotPasswordV2(): UseForgotPasswordV2Return {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  // Request reset state
  const [state, setState] = useState<ForgotPasswordState>({
    email: '',
    isLoading: false,
    isSuccess: false,
    error: null,
  });

  // Reset password state
  const [resetState, setResetState] = useState<ResetPasswordState>({
    newPassword: '',
    confirmPassword: '',
    isLoading: false,
    isSuccess: false,
    error: null,
    passwordStrength: 0,
    passwordErrors: [],
  });

  const setEmail = useCallback((email: string) => {
    setState((prev) => ({ ...prev, email, error: null }));
  }, []);

  const setNewPassword = useCallback((password: string) => {
    const strength = passwordResetService.calculatePasswordStrength(password);
    const validation = passwordResetService.validatePasswordStrength(password);

    setResetState((prev) => ({
      ...prev,
      newPassword: password,
      passwordStrength: strength,
      passwordErrors: validation.errors,
      error: null,
    }));
  }, []);

  const setConfirmPassword = useCallback((password: string) => {
    setResetState((prev) => ({ ...prev, confirmPassword: password, error: null }));
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!state.email) {
        setState((prev) => ({ ...prev, error: 'Veuillez entrer votre email' }));
        return;
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const response = await passwordResetService.requestReset({
          email: state.email,
        });

        if (response.success) {
          setState((prev) => ({ ...prev, isLoading: false, isSuccess: true }));
        } else {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: response.message || 'Une erreur est survenue',
          }));
        }
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: 'Erreur de connexion. Veuillez reessayer.',
        }));
      }
    },
    [state.email]
  );

  const handleResetSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!token) {
        setResetState((prev) => ({
          ...prev,
          error: 'Lien de reinitialisation invalide',
        }));
        return;
      }

      if (!resetState.newPassword || !resetState.confirmPassword) {
        setResetState((prev) => ({
          ...prev,
          error: 'Veuillez remplir tous les champs',
        }));
        return;
      }

      if (resetState.newPassword !== resetState.confirmPassword) {
        setResetState((prev) => ({
          ...prev,
          error: 'Les mots de passe ne correspondent pas',
        }));
        return;
      }

      const validation = passwordResetService.validatePasswordStrength(resetState.newPassword);
      if (!validation.isValid) {
        setResetState((prev) => ({
          ...prev,
          error: validation.errors[0],
        }));
        return;
      }

      setResetState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const response = await passwordResetService.resetPassword({
          token,
          newPassword: resetState.newPassword,
          confirmPassword: resetState.confirmPassword,
        });

        if (response.success) {
          setResetState((prev) => ({ ...prev, isLoading: false, isSuccess: true }));
          // Redirect to login after 2 seconds
          setTimeout(() => {
            router.push('/v2/login?reset=success');
          }, 2000);
        } else {
          setResetState((prev) => ({
            ...prev,
            isLoading: false,
            error: response.error || 'Une erreur est survenue',
          }));
        }
      } catch (error) {
        setResetState((prev) => ({
          ...prev,
          isLoading: false,
          error: 'Erreur de connexion. Veuillez reessayer.',
        }));
      }
    },
    [token, resetState.newPassword, resetState.confirmPassword, router]
  );

  const getPasswordStrengthLabel = useCallback(() => {
    const labels: Record<number, string> = {
      0: 'Tres faible',
      1: 'Faible',
      2: 'Moyen',
      3: 'Fort',
      4: 'Tres fort',
    };
    return labels[resetState.passwordStrength] || 'Faible';
  }, [resetState.passwordStrength]);

  const getPasswordStrengthColor = useCallback(() => {
    const colors: Record<number, string> = {
      0: 'var(--gp-error)',
      1: 'var(--gp-error)',
      2: 'var(--gp-amber)',
      3: 'var(--gp-deep-teal)',
      4: 'var(--gp-success)',
    };
    return colors[resetState.passwordStrength] || 'var(--gp-error)';
  }, [resetState.passwordStrength]);

  return {
    state,
    setEmail,
    handleSubmit,
    resetState,
    setNewPassword,
    setConfirmPassword,
    handleResetSubmit,
    getPasswordStrengthLabel,
    getPasswordStrengthColor,
  };
}
