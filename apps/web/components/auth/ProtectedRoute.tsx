'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useIsAuthChecking } from '@/stores';
import { useAuth } from '@/hooks/use-auth';
import { LoadingState } from '@/components/ui/loading-state';
import { authManager } from '@/services/auth-manager.service';

interface ProtectedRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
  requireAuth?: boolean;
}

export function ProtectedRoute({
  children,
  redirectTo = '/login',
  requireAuth = true
}: ProtectedRouteProps) {
  const user = useUser();
  const isAuthChecking = useIsAuthChecking();
  const { forceLogout } = useAuth();
  const router = useRouter();
  const [timeoutReached, setTimeoutReached] = useState(false);

  // Timeout de sécurité pour éviter le blocage infini
  useEffect(() => {
    const timer = setTimeout(() => {
      setTimeoutReached(true);
    }, 3000); // 3 secondes maximum pour être plus rapide

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Ne faire des redirections que si la vérification d'auth est terminée OU si le timeout est atteint
    if (isAuthChecking && !timeoutReached) {
      return;
    }

    const token = authManager.getAuthToken();

    if (requireAuth && !user && !token) {
      router.push(redirectTo);
      return;
    }

    // Si nous avons un token mais pas d'utilisateur après vérification, nettoyer les données
    if (requireAuth && !user && token && !isAuthChecking) {
      forceLogout?.();
      router.push(redirectTo);
      return;
    }

    if (!requireAuth && user && token) {
      router.push('/conversations');
      return;
    }
  }, [user?.id, isAuthChecking, timeoutReached, router, redirectTo, requireAuth, forceLogout]);

  // Afficher un état de chargement pendant la vérification d'authentification
  if (isAuthChecking && !timeoutReached) {
    return <LoadingState message="Vérification de l'authentification..." fullScreen />;
  }

  // Afficher un état de chargement si l'auth est requise mais l'utilisateur n'est pas encore chargé
  // ET qu'il n'y a pas de token (sinon l'utilisateur devrait être chargé depuis l'API)
  const token = authManager.getAuthToken();
  if (requireAuth && !user && !token) {
    return <LoadingState message="Redirection vers la page de connexion..." fullScreen />;
  }

  // Si l'authentification n'est pas requise et que l'utilisateur est connecté, afficher un loading
  if (!requireAuth && user && token) {
    return <LoadingState message="Redirection..." fullScreen />;
  }

  // Afficher le contenu protégé
  return <>{children}</>;
}
