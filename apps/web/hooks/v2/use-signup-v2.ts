'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useLanguageStore } from '@/stores/language-store';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { toast } from 'sonner';

interface SignupState {
  step: 1 | 2;
  name: string;
  email: string;
  password: string;
  selectedLanguage: string;
  isLoading: boolean;
  error: string | null;
}

interface UseSignupV2Return {
  state: SignupState;
  setName: (name: string) => void;
  setEmail: (email: string) => void;
  setPassword: (password: string) => void;
  setSelectedLanguage: (lang: string) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  goBack: () => void;
  clearError: () => void;
}

export function useSignupV2(): UseSignupV2Return {
  const router = useRouter();
  const { login } = useAuth();
  const { setInterfaceLanguage } = useLanguageStore();

  const [state, setState] = useState<SignupState>({
    step: 1,
    name: '',
    email: '',
    password: '',
    selectedLanguage: 'fr',
    isLoading: false,
    error: null,
  });

  const setName = useCallback((name: string) => {
    setState(prev => ({ ...prev, name, error: null }));
  }, []);

  const setEmail = useCallback((email: string) => {
    setState(prev => ({ ...prev, email, error: null }));
  }, []);

  const setPassword = useCallback((password: string) => {
    setState(prev => ({ ...prev, password, error: null }));
  }, []);

  const setSelectedLanguage = useCallback((selectedLanguage: string) => {
    setState(prev => ({ ...prev, selectedLanguage }));
  }, []);

  const goBack = useCallback(() => {
    setState(prev => ({ ...prev, step: 1, error: null }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const validateStep1 = useCallback((): boolean => {
    const { name, email, password } = state;

    if (!name.trim()) {
      setState(prev => ({ ...prev, error: 'Veuillez entrer votre nom' }));
      return false;
    }
    if (!email.trim() || !email.includes('@')) {
      setState(prev => ({ ...prev, error: 'Veuillez entrer un email valide' }));
      return false;
    }
    if (password.length < 8) {
      setState(prev => ({ ...prev, error: 'Le mot de passe doit contenir au moins 8 caracteres' }));
      return false;
    }

    return true;
  }, [state]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    const { step, name, email, password, selectedLanguage } = state;

    // Step 1: Validation et passage au step 2
    if (step === 1) {
      if (validateStep1()) {
        setState(prev => ({ ...prev, step: 2 }));
      }
      return;
    }

    // Step 2: Inscription
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const [firstName, ...lastNameParts] = name.trim().split(' ');
      const lastName = lastNameParts.join(' ') || firstName;
      const username = email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '_');

      const response = await fetch(buildApiUrl(API_ENDPOINTS.AUTH.REGISTER), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          firstName,
          lastName,
          email,
          password,
          systemLanguage: selectedLanguage,
          regionalLanguage: 'en',
        }),
      });

      const data = await response.json();

      if (response.ok && data.success && data.data) {
        const { user, token, expiresIn } = data.data;

        // Sauver preferences
        setInterfaceLanguage(selectedLanguage);

        // Login automatique
        login(user, token, undefined, expiresIn);

        toast.success('Compte cree avec succes !');
        router.push('/v2/chats');
      } else {
        const errorMsg = getSignupErrorMessage(response.status, data.error);
        setState(prev => ({ ...prev, error: errorMsg, isLoading: false }));
        toast.error(errorMsg);
      }
    } catch (err) {
      const errorMsg = 'Impossible de creer le compte';
      setState(prev => ({ ...prev, error: errorMsg, isLoading: false }));
      toast.error(errorMsg);
    }
  }, [state, validateStep1, login, router, setInterfaceLanguage]);

  return {
    state,
    setName,
    setEmail,
    setPassword,
    setSelectedLanguage,
    handleSubmit,
    goBack,
    clearError,
  };
}

function getSignupErrorMessage(status: number, error?: string): string {
  if (!error) {
    if (status === 400) return 'Donnees invalides';
    if (status === 500) return 'Erreur serveur, reessayez plus tard';
    return 'Erreur lors de l\'inscription';
  }

  const lowerError = error.toLowerCase();

  if (lowerError.includes('email')) return 'Cet email est deja utilise';
  if (lowerError.includes('username')) return 'Ce nom d\'utilisateur existe deja';
  if (lowerError.includes('phone')) return 'Ce numero est deja enregistre';

  return error;
}
