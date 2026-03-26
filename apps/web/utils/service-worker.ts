/**
 * SERVICE WORKER UTILITIES
 * Gestion avancée de l'enregistrement et de la mise à jour forcée.
 * Implémente l'invalidation complète des caches et des données locales.
 */

/**
 * Enregistre le service worker et initialise la détection de mise à jour.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });

    console.log('[SW] Registered:', registration.scope);

    // Détection immédiate au chargement
    if (registration.waiting) {
      notifyUpdateAvailable(registration);
    }

    // Détection lors d'une vérification ultérieure
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          notifyUpdateAvailable(registration);
        }
      });
    });

    // Rechargement automatique quand le nouveau SW prend le contrôle
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      console.log('[SW] Controller changed. Reloading app...');
      window.location.reload();
    });

    // 1. Vérifier les mises à jour immédiatement au démarrage
    registration.update().catch(console.warn);

    // 2. Vérifier les mises à jour quand l'utilisateur revient sur l'onglet (Refocus)
    // C'est un pattern efficace utilisé par beaucoup d'apps (WhatsApp, Slack)
    window.addEventListener('focus', () => {
      registration.update().catch(console.warn);
    });

    return registration;
  } catch (error) {
    console.error('[SW] Registration failed:', error);
    return null;
  }
}

/**
 * Déclenche l'invalidation complète de l'application et la mise à jour.
 * Nettoie les caches d'assets ET les données IndexedDB.
 */
export async function performFullAppInvalidationAndReload(registration: ServiceWorkerRegistration) {
  console.log('[SW] Starting full application invalidation...');

  try {
    // 0. Déconnecter gracieusement le WebSocket AVANT le reload
    // Évite que handleAuthenticationFailure → logout ne purge la session
    try {
      const { meeshySocketIOService } = await import('@/services/meeshy-socketio.service');
      meeshySocketIOService.disconnectForUpdate();
      console.log('[SW] WebSocket gracefully disconnected for update.');
    } catch (e) {
      console.warn('[SW] Could not disconnect WebSocket:', e);
    }

    // 1. Invalider tous les caches de l'API CacheStorage
    if ('caches' in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map(key => caches.delete(key)));
      console.log('[SW] CacheStorage cleared.');
    }

    // 2. Invalider l'IndexedDB (Données React Query / Meeshy)
    // On itère sur les bases de données connues ou on utilise une suppression brutale
    if ('indexedDB' in window) {
      // Pour Meeshy, le cache React Query est géré via idb-keyval ou une DB nommée
      // On tente de supprimer les bases liées connues
      const dbs = ['keyval-store', 'meeshy-rq-cache'];
      dbs.forEach(dbName => {
        const req = indexedDB.deleteDatabase(dbName);
        req.onerror = () => console.warn(`[SW] Could not delete DB: ${dbName}`);
        req.onsuccess = () => console.log(`[SW] Deleted DB: ${dbName}`);
      });
    }

    // 3. Demander au SW en attente de s'activer
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      // Si pas de worker en attente (cas rare au clic), on force juste le reload
      window.location.reload();
    }
  } catch (error) {
    console.error('[SW] Critical error during invalidation:', error);
    // On reload quand même pour essayer de restaurer un état stable
    window.location.reload();
  }
}

/**
 * Notifie l'interface via un CustomEvent
 */
function notifyUpdateAvailable(registration: ServiceWorkerRegistration) {
  console.log('[SW] New build detected. Waiting for user confirmation.');
  window.dispatchEvent(
    new CustomEvent('sw-update-available', {
      detail: { registration },
    })
  );
}

/**
 * Helper compatible avec l'UI existante
 */
export async function activateWaitingServiceWorker(registration: ServiceWorkerRegistration) {
  return performFullAppInvalidationAndReload(registration);
}

/**
 * Déclenche un check manuel du sw.js (utilisé par le Gateway ou check périodique)
 */
export async function triggerManualUpdateCheck() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (registration) await registration.update();
}

/**
 * Désinstalle le service worker
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? await registration.unregister() : false;
}

export function isServiceWorkerActive(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(false);
  return navigator.serviceWorker.getRegistration().then(reg => !!reg && !!reg.active);
}
