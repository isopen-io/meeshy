'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

interface AnonymousRedirectProps {
  children: React.ReactNode;
  redirectToChat?: boolean;
}

/**
 * Composant qui gère la redirection des utilisateurs anonymes
 * - Si redirectToChat=true et que l'utilisateur anonyme a une conversation en cours, redirige vers /chat/[id]
 * - Sinon, affiche le contenu normalement
 */
export function AnonymousRedirect({ 
  children, 
  redirectToChat = true 
}: AnonymousRedirectProps) {
  const router = useRouter();
  const { isAnonymous, isChecking } = useAuth();

  useEffect(() => {
    if (isChecking) return;
    
    if (redirectToChat && isAnonymous) {
      // Vérifier si l'utilisateur anonyme a une conversation en cours
      const storedShareLinkId = localStorage.getItem('anonymous_current_share_link');
      
      if (storedShareLinkId) {
        // Rediriger vers la conversation en cours
        router.push(`/chat/${storedShareLinkId}`);
      }
      // Si pas de conversation en cours, rester sur la page actuelle
    }
  }, [isAnonymous, isChecking, redirectToChat, router]);

  // Si on est en train de vérifier ou de rediriger, ne rien afficher
  if (isChecking || (redirectToChat && isAnonymous && localStorage.getItem('anonymous_current_share_link'))) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return <>{children}</>;
}
