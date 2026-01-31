'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { authService } from '@/services/auth.service';
import { toast } from 'sonner';

interface LoginState {
  email: string;
  password: string;
  isLoading: boolean;
  error: string | null;
  rememberMe: boolean;
}

interface UseLoginV2Return {
  state: LoginState;
  setEmail: (email: string) => void;
  setPassword: (password: string) => void;
  setRememberMe: (remember: boolean) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  clearError: () => void;
}

export function useLoginV2(): UseLoginV2Return {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const [state, setState] = useState<LoginState>({
    email: '',
    password: '',
    isLoading: false,
    error: null,
    rememberMe: false,
  });

  const setEmail = useCallback((email: string) => {
    setState(prev => ({ ...prev, email, error: null }));
  }, []);

  const setPassword = useCallback((password: string) => {
    setState(prev => ({ ...prev, password, error: null }));
  }, []);

  const setRememberMe = useCallback((rememberMe: boolean) => {
    setState(prev => ({ ...prev, rememberMe }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    const { email, password, rememberMe } = state;

    // Validation client
    if (!email.trim() || !password.trim()) {
      setState(prev => ({ ...prev, error: 'Veuillez remplir tous les champs' }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await authService.login(email, password);

      if (response.success && response.data) {
        const { user, token, expiresIn } = response.data;

        // Login avec option "se souvenir de moi"
        const sessionDuration = rememberMe ? expiresIn : undefined;
        login(user, token, undefined, sessionDuration);

        toast.success('Connexion reussie !');

        // Redirection
        const returnUrl = searchParams.get('returnUrl') || '/v2/chats';
        router.push(returnUrl);
      } else {
        const errorMsg = getLoginErrorMessage(response.error);
        setState(prev => ({ ...prev, error: errorMsg, isLoading: false }));
        toast.error(errorMsg);
      }
    } catch (err) {
      const errorMsg = 'Impossible de se connecter au serveur';
      setState(prev => ({ ...prev, error: errorMsg, isLoading: false }));
      toast.error(errorMsg);
    }
  }, [state, login, router, searchParams]);

  return {
    state,
    setEmail,
    setPassword,
    setRememberMe,
    handleSubmit,
    clearError,
  };
}

function getLoginErrorMessage(error?: string): string {
  if (!error) return 'Erreur de connexion';

  const lowerError = error.toLowerCase();

  if (lowerError.includes('invalid') || lowerError.includes('incorrect')) {
    return 'Email ou mot de passe incorrect';
  }
  if (lowerError.includes('disabled') || lowerError.includes('blocked')) {
    return 'Votre compte a ete desactive';
  }
  if (lowerError.includes('not found')) {
    return 'Aucun compte avec cet email';
  }
  if (lowerError.includes('too many')) {
    return 'Trop de tentatives, reessayez plus tard';
  }

  return error;
}
