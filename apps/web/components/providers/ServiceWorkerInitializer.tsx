/**
 * Service Worker Initializer
 * Déclenche l'enregistrement du Service Worker au démarrage de l'application
 */

'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/utils/service-worker';

export function ServiceWorkerInitializer() {
  useEffect(() => {
    // Enregistre le SW au démarrage du client
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      registerServiceWorker().catch(err => {
        console.error('[SW] Registration failed:', err);
      });
    }
  }, []);

  return null;
}
