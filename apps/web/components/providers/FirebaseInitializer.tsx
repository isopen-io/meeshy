/**
 * Firebase Initializer Component
 * Vérifie Firebase au démarrage de l'application
 * Ne rend rien visuellement, juste initialise Firebase en arrière-plan
 *
 * @module FirebaseInitializer
 */

'use client';

import { useEffect } from 'react';
import { useFirebaseInit } from '@/hooks/use-firebase-init';

/**
 * Composant pour initialiser Firebase au démarrage de l'app
 * À placer dans le Layout racine
 */
export function FirebaseInitializer() {
  const { status, loading } = useFirebaseInit();

  useEffect(() => {
    // Afficher un message uniquement en développement
    if (!loading && process.env.NODE_ENV === 'development') {
      if (status.available) {
        console.info(
          '%c[Meeshy] Firebase initialized successfully',
          'color: green; font-weight: bold; font-size: 12px;',
          '\n  Push notifications:', status.pushEnabled ? '✅ Enabled' : '❌ Disabled',
          '\n  PWA badges:', status.badgeEnabled ? '✅ Enabled' : '❌ Disabled'
        );
      } else {
        console.info(
          '%c[Meeshy] Running without Firebase',
          'color: orange; font-weight: bold; font-size: 12px;',
          '\n  Mode: WebSocket notifications only',
          '\n  Reason:', status.reason || 'Firebase not configured'
        );
      }
    }
  }, [loading, status]);

  // Ne rend rien (composant invisible)
  return null;
}
