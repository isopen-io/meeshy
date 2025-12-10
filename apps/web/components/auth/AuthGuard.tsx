'use client';

import { ReactNode } from 'react';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { LoadingState } from '@/components/common';

interface AuthGuardProps {
  children: ReactNode;
  redirectTo?: string;
  requireAuth?: boolean;
  fallback?: ReactNode;
}

export function AuthGuard({ 
  children, 
  redirectTo = '/login', 
  requireAuth = true,
  fallback
}: AuthGuardProps) {
  const { isChecking, isAuthenticated } = useAuthGuard({
    redirectTo,
    requireAuth
  });

  // Afficher un état de chargement pendant la vérification
  if (isChecking) {
    return fallback || <LoadingState message="Vérification de l'authentification..." fullScreen />;
  }

  // Si l'authentification est requise mais l'utilisateur n'est pas authentifié
  if (requireAuth && !isAuthenticated) {
    return fallback || <LoadingState message="Redirection..." fullScreen />;
  }

  // Si l'authentification n'est pas requise mais l'utilisateur est authentifié
  if (!requireAuth && isAuthenticated) {
    return fallback || <LoadingState message="Redirection..." fullScreen />;
  }

  // Afficher le contenu protégé
  return <>{children}</>;
}
