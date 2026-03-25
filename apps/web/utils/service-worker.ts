/**
 * SERVICE WORKER UTILITIES
 * Enregistrement et gestion du service worker avec détection automatique de mise à jour.
 * Pattern "WhatsApp style" : déclenchement sur différence de version détectée par WebSocket.
 */

/**
 * Enregistre le service worker et retourne l'instance
 *
 * @returns ServiceWorkerRegistration ou null si échec
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    console.warn('[SW] Service Worker not supported on this browser');
    return null;
  }

  try {
    // Enregistrer le service worker
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none', // Toujours chercher les mises à jour sur le réseau
    });

    console.log('[SW] Registered successfully:', registration.scope);

    // 1. Détection initiale d'un worker en attente (déjà installé lors d'une session précédente)
    if (registration.waiting) {
      notifyUpdateAvailable(registration);
    }

    // 2. Écouter les futures mises à jour (quand registration.update() est appelé)
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // Nouvelle version installée et prête à être activée
          notifyUpdateAvailable(registration);
        }
      });
    });

    // 3. Écouter le changement de contrôleur (quand le nouveau SW prend le contrôle après SKIP_WAITING)
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      // Recharger la page pour activer la nouvelle version sur tout le site
      window.location.reload();
    });

    return registration;
  } catch (error) {
    console.error('[SW] Registration failed:', error);
    return null;
  }
}

/**
 * Force le navigateur à vérifier si une nouvelle version du sw.js existe.
 * Appelé lorsqu'un mismatch de version est détecté (ex: via WebSocket).
 */
export async function triggerManualUpdateCheck(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      console.log('[SW] Triggering manual update check due to version mismatch...');
      await registration.update();
    }
  } catch (error) {
    console.warn('[SW] Manual update check failed', error);
  }
}

/**
 * Notifie l'interface qu'une mise à jour est disponible via un CustomEvent
 */
function notifyUpdateAvailable(registration: ServiceWorkerRegistration) {
  console.log('[SW] New version available and waiting to activate');
  window.dispatchEvent(
    new CustomEvent('sw-update-available', {
      detail: { registration },
    })
  );
}

/**
 * Force le service worker en attente à s'activer et nettoie les caches
 */
export async function activateWaitingServiceWorker(registration: ServiceWorkerRegistration) {
  if (registration.waiting) {
    // 1. Demander au SW de s'activer
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });

    // 2. Tenter de vider les caches nommés côté client pour garantir la fraîcheur
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
        console.log('[SW] All caches invalidated before reload');
      } catch (err) {
        console.warn('[SW] Cache invalidation failed', err);
      }
    }
  }
}

/**
 * Désinstalle le service worker
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      return false;
    }

    const success = await registration.unregister();
    console.log('[SW] Unregistered:', success);
    return success;
  } catch (error) {
    console.error('[SW] Unregister failed:', error);
    return false;
  }
}

/**
 * Vérifie si le service worker est enregistré et actif
 */
export function isServiceWorkerActive(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(false);
  }

  return navigator.serviceWorker.getRegistration().then(reg => !!reg && !!reg.active);
}

/**
 * Envoie un message au service worker
 */
export async function sendMessageToServiceWorker(message: any): Promise<any> {
  if (typeof window === 'undefined' || !navigator.serviceWorker.controller) {
    throw new Error('No service worker controller');
  }

  return new Promise((resolve, reject) => {
    const messageChannel = new MessageChannel();

    messageChannel.port1.onmessage = (event) => {
      if (event.data.error) {
        reject(event.data.error);
      } else {
        resolve(event.data);
      }
    };

    navigator.serviceWorker.controller!.postMessage(message, [messageChannel.port2]);
  });
}
