/**
 * SERVICE WORKER UTILITIES
 * Enregistrement et gestion du service worker
 */

/**
 * Enregistre le service worker et retourne l'instance
 *
 * @returns ServiceWorkerRegistration ou null si échec
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('[SW] Service Worker not supported on this browser');
    return null;
  }

  try {
    // Enregistrer le service worker
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none', // Toujours chercher les mises à jour
    });

    console.log('[SW] Registered successfully:', registration.scope);

    // Gérer les mises à jour du service worker
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      console.log('[SW] Update found');

      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          console.log('[SW] State changed:', newWorker.state);

          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // Nouvelle version installée mais pas encore activée
            console.log('[SW] New version available');

            // Optionnel : notifier l'utilisateur qu'une mise à jour est disponible
            window.dispatchEvent(
              new CustomEvent('sw-update-available', {
                detail: { registration },
              })
            );
          }
        });
      }
    });

    // Vérifier immédiatement s'il y a une mise à jour
    registration.update().catch((error) => {
      console.warn('[SW] Update check failed:', error);
    });

    return registration;
  } catch (error) {
    console.error('[SW] Registration failed:', error);
    return null;
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
 * Force le service worker à se mettre à jour
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
    console.log('[SW] Update triggered');
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

    navigator.serviceWorker.controller.postMessage(message, [messageChannel.port2]);
  });
}
