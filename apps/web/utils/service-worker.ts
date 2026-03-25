/**
 * SERVICE WORKER UTILITIES
 * Enregistrement et gestion du service worker avec détection automatique de mise à jour.
 */

// Intervalle de vérification automatique pour les nouveaux builds Docker (tous les 15 minutes)
const UPDATE_CHECK_INTERVAL = 15 * 60 * 1000;

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

    // 2. Écouter les futures mises à jour
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

    // 3. Écouter le changement de contrôleur (quand le nouveau SW prend le contrôle)
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      // Recharger la page pour activer la nouvelle version sur tout le site
      window.location.reload();
    });

    // 4. Automatiser le check de nouvelle version Docker périodiquement
    setInterval(() => {
      console.log('[SW] Checking for new build/version...');
      registration.update().catch((err) => {
        console.warn('[SW] Periodic update check failed', err);
      });
    }, UPDATE_CHECK_INTERVAL);

    return registration;
  } catch (error) {
    console.error('[SW] Registration failed:', error);
    return null;
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
 * Force le service worker en attente à s'activer
 */
export function activateWaitingServiceWorker(registration: ServiceWorkerRegistration) {
  if (registration.waiting) {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
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
 * Force le service worker à se mettre à jour manuellement
 */
export async function updateServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      return null;
    }

    await registration.update();
    console.log('[SW] Update triggered manually');
    return registration;
  } catch (error) {
    console.error('[SW] Update failed:', error);
    return null;
  }
}

/**
 * Vérifie si le service worker est enregistré et actif
 */
export async function isServiceWorkerActive(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    return false;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  return registration !== undefined && registration.active !== null;
}

/**
 * Envoie un message au service worker
 *
 * @param message Message à envoyer
 * @returns Réponse du service worker
 */
export async function sendMessageToServiceWorker(message: any): Promise<any> {
  if (!navigator.serviceWorker.controller) {
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
