'use client';

import { useState, useEffect } from 'react';
import { useUser, useIsAuthChecking } from '@/stores';
import { useAuth } from '@/hooks/use-auth';
import { isCurrentUserAnonymous } from '@/utils/auth';
import { authManager } from '@/services/auth-manager.service';
import type { AuthMode } from '@/types';

export type LandingAuthState =
  | { mode: 'checking' }
  | { mode: 'authenticated'; user: NonNullable<ReturnType<typeof useUser>> }
  | { mode: 'unauthenticated'; anonymousChatLink: string | null };

export function useLandingAuth() {
  const user = useUser();
  const isAuthChecking = useIsAuthChecking();
  const { login } = useAuth();
  const [authMode, setAuthMode] = useState<AuthMode>('welcome');
  const [anonymousChatLink, setAnonymousChatLink] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const getCookie = (name: string) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop()?.split(';').shift();
      return null;
    };
    const affiliateToken = getCookie('meeshy_affiliate_token');
    if (affiliateToken) {
      localStorage.setItem('meeshy_affiliate_token', affiliateToken);
    }
  }, []);

  useEffect(() => {
    const isAnonymous = isCurrentUserAnonymous();
    if (user && isAnonymous) {
      const storedShareLinkId = localStorage.getItem('anonymous_current_share_link');
      if (storedShareLinkId) {
        setAnonymousChatLink(`/chat/${storedShareLinkId}`);
      }
    } else {
      setAnonymousChatLink(null);
    }
  }, [user]);

  const hasAuthToken = !!authManager.getAuthToken();
  const isAnonymous = isCurrentUserAnonymous();

  if (isAuthChecking) {
    return { state: { mode: 'checking' } as const, authMode, setAuthMode, login };
  }

  if (user && hasAuthToken) {
    if (isAnonymous) {
      localStorage.removeItem('anonymous_session_token');
      localStorage.removeItem('anonymous_participant');
      localStorage.removeItem('anonymous_current_share_link');
      localStorage.removeItem('anonymous_current_link_id');
      localStorage.removeItem('anonymous_just_joined');
    }
    return {
      state: { mode: 'authenticated', user } as const,
      authMode,
      setAuthMode,
      login,
    };
  }

  return {
    state: { mode: 'unauthenticated', anonymousChatLink } as const,
    authMode,
    setAuthMode,
    login,
  };
}
