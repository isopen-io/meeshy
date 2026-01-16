'use client';

import { ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';

interface AuthGuardProps {
  children: ReactNode;
  requireAuth?: boolean;
  allowAnonymous?: boolean;
  fallback?: ReactNode;
}

export function AuthGuard({ 
  children, 
  requireAuth = true, 
  allowAnonymous = false,
  fallback 
}: AuthGuardProps) {
  const { isAuthenticated, isChecking, isAnonymous } = useAuth();

  // Pendant la vérification, afficher un loader unifié (h-12 w-12)
  if (isChecking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Vérification...</p>
        </div>
      </div>
    );
  }

  // Si l'authentification est requise mais l'utilisateur n'est pas connecté
  if (requireAuth && !isAuthenticated) {
    if (fallback) {
      return <>{fallback}</>;
    }
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-700 mb-4">Accès refusé</h1>
          <p className="text-red-600 mb-6">Vous devez être connecté pour accéder à cette page</p>
          <button 
            onClick={() => window.location.href = '/login'}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Se connecter
          </button>
        </div>
      </div>
    );
  }

  // Si les sessions anonymes ne sont pas autorisées mais l'utilisateur est anonyme
  if (!allowAnonymous && isAnonymous) {
    if (fallback) {
      return <>{fallback}</>;
    }
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-100 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-orange-700 mb-4">Compte requis</h1>
          <p className="text-orange-600 mb-6">Cette page nécessite un compte permanent</p>
          <button 
            onClick={() => window.location.href = '/register'}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
          >
            Créer un compte
          </button>
        </div>
      </div>
    );
  }

  // Tout est OK, afficher le contenu
  return <>{children}</>;
}
