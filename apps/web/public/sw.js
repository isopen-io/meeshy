/**
 * SERVICE WORKER - MEESHY PWA
 * Gère les notifications push et le cache de l'application
 */

/// <reference lib="webworker" />

// Déclaration du contexte du service worker
const SW_VERSION = '1.0.0';
const CACHE_NAME = `meeshy-v${SW_VERSION}`;

// Log helper
function log(...args) {
  console.log(`[SW ${SW_VERSION}]`, ...args);
}

// ============================================================================
// INSTALLATION
// ============================================================================

self.addEventListener('install', (event) => {
  log('Installing...');

  // Skip waiting pour activer immédiatement
  self.skipWaiting();

  // Pré-cache des ressources essentielles (optionnel)
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      log('Cache opened');
      return cache.addAll([
        '/',
        '/icons/icon-192x192.png',
        '/icons/icon-512x512.png',
        '/icons/badge-72x72.png',
      ]).catch((error) => {
        log('Cache addAll failed:', error);
        // Ne pas bloquer l'installation si le cache échoue
      });
    })
  );
});

// ============================================================================
// ACTIVATION
// ============================================================================

self.addEventListener('activate', (event) => {
  log('Activating...');

  event.waitUntil(
    (async () => {
      // Prendre le contrôle de tous les clients
      await self.clients.claim();

      // Nettoyer les anciens caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            log('Deleting old cache:', name);
            return caches.delete(name);
          })
      );

      log('Activated successfully');
    })()
  );
});

// ============================================================================
// NOTIFICATIONS PUSH
// ============================================================================

self.addEventListener('push', (event) => {
  log('Push received');

  if (!event.data) {
    log('Push event but no data');
    return;
  }

  try {
    const data = event.data.json();
    const { title, body, icon, badge, image, data: notificationData, tag, renotify, requireInteraction, vibrate, actions } = data;

    const options = {
      body: body || '',
      icon: icon || '/icons/icon-192x192.png',
      badge: badge || '/icons/badge-72x72.png',
      image: image,
      data: notificationData || {},
      tag: tag || notificationData?.conversationId || 'default',
      renotify: renotify !== undefined ? renotify : true,
      requireInteraction: requireInteraction || false,
      vibrate: vibrate || [200, 100, 200],
      actions: actions || [
        {
          action: 'open',
          title: 'Ouvrir',
        },
        {
          action: 'close',
          title: 'Fermer',
        },
      ],
      timestamp: Date.now(),
    };

    event.waitUntil(
      (async () => {
        await self.registration.showNotification(title, options);

        // Mettre à jour le badge
        const unreadCount = notificationData?.unreadCount || 1;
        if ('setAppBadge' in navigator) {
          try {
            await navigator.setAppBadge(unreadCount);
            log('Badge updated to:', unreadCount);
          } catch (error) {
            log('Failed to update badge:', error);
          }
        }

        log('Notification shown:', title);
      })()
    );
  } catch (error) {
    log('Error showing notification:', error);
  }
});

// ============================================================================
// CLIC SUR NOTIFICATION
// ============================================================================

self.addEventListener('notificationclick', (event) => {
  log('Notification clicked:', event.action);

  event.notification.close();

  const action = event.action;
  const notificationData = event.notification.data || {};

  // Si action "close", ne rien faire
  if (action === 'close') {
    return;
  }

  // Construire l'URL de destination
  let targetUrl = '/';

  if (notificationData.url) {
    targetUrl = notificationData.url;
  } else if (notificationData.conversationId) {
    targetUrl = `/conversations/${notificationData.conversationId}`;
  }

  const urlToOpen = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    (async () => {
      // Récupérer tous les clients (fenêtres/tabs)
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      log('Found clients:', clients.length);

      // Chercher un client avec l'URL exacte
      for (const client of clients) {
        if (client.url === urlToOpen && 'focus' in client) {
          log('Focusing existing client with exact URL');
          return client.focus();
        }
      }

      // Chercher un client avec la même origine
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          log('Focusing existing client and navigating');
          const focusedClient = await client.focus();

          // Envoyer un message pour naviguer vers l'URL
          focusedClient.postMessage({
            type: 'NOTIFICATION_CLICKED',
            url: targetUrl,
            data: notificationData,
          });

          return focusedClient;
        }
      }

      // Aucun client trouvé, ouvrir une nouvelle fenêtre
      if (self.clients.openWindow) {
        log('Opening new window');
        return self.clients.openWindow(urlToOpen);
      }
    })()
  );
});

// ============================================================================
// FERMETURE DE NOTIFICATION
// ============================================================================

self.addEventListener('notificationclose', (event) => {
  log('Notification closed');

  // Optionnel : envoyer des analytics
  const data = event.notification.data;
  if (data && data.conversationId) {
    // Envoyer à analytics
    log('Notification closed for conversation:', data.conversationId);
  }
});

// ============================================================================
// MESSAGES DU CLIENT
// ============================================================================

self.addEventListener('message', (event) => {
  log('Message received:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_BADGE') {
    if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge().then(() => {
        log('Badge cleared');
      }).catch((error) => {
        log('Failed to clear badge:', error);
      });
    }
  }

  if (event.data && event.data.type === 'SET_BADGE') {
    const count = event.data.count || 0;
    if ('setAppBadge' in navigator) {
      navigator.setAppBadge(count).then(() => {
        log('Badge set to:', count);
      }).catch((error) => {
        log('Failed to set badge:', error);
      });
    }
  }
});

// ============================================================================
// FETCH (CACHE STRATEGY)
// ============================================================================

self.addEventListener('fetch', (event) => {
  // Pour l'instant, on ne fait pas de cache agressif
  // Juste laisser passer toutes les requêtes normalement
  // On peut implémenter des stratégies de cache plus tard si besoin

  // Network First pour les données dynamiques
  event.respondWith(
    fetch(event.request).catch(() => {
      // Si le réseau échoue, essayer le cache
      return caches.match(event.request);
    })
  );
});

log('Service Worker loaded');
