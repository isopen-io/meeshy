/**
 * Layout pour les liens de tracking Meeshy (/l/[token])
 *
 * IMPORTANT: Cette route est PUBLIQUE et ne nécessite PAS d'authentification
 * Les liens de tracking doivent être accessibles à tous les utilisateurs
 */

import { ReactNode } from 'react';

export default function TrackingLinksLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Pas d'AuthGuard ici - la route est publique
  return <>{children}</>;
}

/**
 * Métadonnées pour les liens de tracking
 */
export const metadata = {
  robots: 'noindex, nofollow', // Ne pas indexer les liens de tracking
};
