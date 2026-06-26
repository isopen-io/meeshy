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
import { logger } from '@/utils/logger';

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
        logger.info('[FirebaseInitializer]', 'Firebase initialized successfully', {
          pushNotifications: status.pushEnabled ? 'Enabled' : 'Disabled',
          pwaBadges: status.badgeEnabled ? 'Enabled' : 'Disabled',
        });
      } else {
        logger.info('[FirebaseInitializer]', 'Running without Firebase', {
          mode: 'WebSocket notifications only',
          reason: status.reason || 'Firebase not configured',
        });
      }
    }
  }, [loading, status]);

  // Ne rend rien (composant invisible)
  return null;
}
