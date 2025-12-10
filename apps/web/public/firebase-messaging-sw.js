/**
 * Firebase Cloud Messaging Service Worker
 * Gère les notifications push en background
 *
 * CRITICAL: Ce SW ne doit PAS crasher si Firebase n'est pas configuré
 * Il doit fonctionner gracieusement avec fallback WebSocket
 *
 * Ce fichier doit être à la racine du domaine (public/)
 */

/// <reference lib="webworker" />

// Log helper
function log(...args) {
  console.log('[FCM-SW]', ...args);
}

log('Firebase Messaging Service Worker loading...');

// Import Firebase scripts (CDN) avec gestion d'erreur
let firebaseLoaded = false;
try {
  importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');
  firebaseLoaded = true;
  log('Firebase scripts loaded successfully');
} catch (error) {
  log('WARNING: Firebase scripts failed to load - Running in WebSocket-only mode');
  log('Error:', error.message);
  firebaseLoaded = false;
}

// Configuration Firebase (seulement si scripts chargés)
let messaging = null;

if (firebaseLoaded) {
  const getFirebaseConfig = () => {
    try {
      // Essayer de récupérer depuis les clients
      return self.registration.scope.includes('config')
        ? JSON.parse(new URLSearchParams(self.registration.scope).get('config'))
        : null;
    } catch (error) {
      log('Could not parse config from scope');
      return null;
    }
  };

  // Configuration par défaut (à remplacer par vos vraies valeurs)
  const defaultConfig = {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  };

  // Initialiser Firebase seulement si firebaseLoaded
  try {
    const config = getFirebaseConfig() || defaultConfig;

    if (config.apiKey && config.apiKey !== '') {
      firebase.initializeApp(config);
      log('Firebase initialized with config');

      // Obtenir l'instance messaging
      if (firebase.messaging.isSupported()) {
        messaging = firebase.messaging();
        log('Firebase Messaging ready');
      } else {
        log('Firebase Messaging not supported on this platform');
      }
    } else {
      log('Firebase config missing API key - Running in WebSocket-only mode');
    }
  } catch (error) {
    log('Firebase initialization error (non-critical):', error.message);
    messaging = null;
  }
} else {
  log('Firebase not loaded - Service Worker running in WebSocket-only mode');
}

// ============================================================================
// NOTIFICATIONS PUSH BACKGROUND
// ============================================================================

if (messaging) {
  // Gérer les messages en background
  messaging.onBackgroundMessage((payload) => {
    log('Background message received:', payload);

    const notificationTitle = payload.notification?.title || payload.data?.title || 'Notification';
    const notificationOptions = {
      body: payload.notification?.body || payload.data?.body || '',
      icon: payload.notification?.icon || payload.data?.icon || '/icons/icon-192x192.png',
      badge: payload.data?.badge || '/icons/badge-72x72.png',
      image: payload.notification?.image || payload.data?.image,
      data: payload.data || {},
      tag: payload.data?.tag || payload.data?.conversationId || 'meeshy-notification',
      requireInteraction: payload.data?.requireInteraction === 'true' || false,
      vibrate: [200, 100, 200],
      actions: [
        {
          action: 'open',
          title: 'Ouvrir'
        },
        {
          action: 'close',
          title: 'Fermer'
        }
      ],
      timestamp: Date.now()
    };

    // Afficher la notification
    return self.registration.showNotification(notificationTitle, notificationOptions)
      .then(() => {
        log('Notification displayed');

        // Mettre à jour le badge si disponible
        const unreadCount = parseInt(payload.data?.unreadCount) || 1;
        if ('setAppBadge' in navigator) {
          navigator.setAppBadge(unreadCount)
            .then(() => log('Badge updated to:', unreadCount))
            .catch((error) => log('Badge update error:', error));
        }
      })
      .catch((error) => {
        log('Notification display error:', error);
      });
  });
}

// ============================================================================
// CLIC SUR NOTIFICATION (géré aussi par sw.js principal)
// ============================================================================

self.addEventListener('notificationclick', (event) => {
  log('Notification clicked:', event.action);

  event.notification.close();

  const action = event.action;
  const data = event.notification.data || {};

  // Si action "close", ne rien faire
  if (action === 'close') {
    return;
  }

  // Construire l'URL de destination
  let targetUrl = '/';
  if (data.url) {
    targetUrl = data.url;
  } else if (data.conversationId) {
    targetUrl = `/chat/${data.conversationId}`;
  }

  const urlToOpen = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {
      log('Found clients:', clientList.length);

      // Chercher un client avec l'URL exacte
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          log('Focusing existing client');
          return client.focus();
        }
      }

      // Chercher un client ouvert
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          log('Focusing existing client and navigating');
          client.focus();
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            url: targetUrl,
            data: data
          });
          return client;
        }
      }

      // Ouvrir nouvelle fenêtre
      if (clients.openWindow) {
        log('Opening new window');
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// ============================================================================
// BADGE MANAGEMENT
// ============================================================================

self.addEventListener('message', (event) => {
  log('Message received:', event.data);

  if (event.data && event.data.type === 'CLEAR_BADGE') {
    if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge()
        .then(() => log('Badge cleared'))
        .catch((error) => log('Badge clear error:', error));
    }
  }

  if (event.data && event.data.type === 'SET_BADGE') {
    const count = event.data.count || 0;
    if ('setAppBadge' in navigator) {
      if (count > 0) {
        navigator.setAppBadge(count)
          .then(() => log('Badge set to:', count))
          .catch((error) => log('Badge set error:', error));
      } else {
        navigator.clearAppBadge()
          .then(() => log('Badge cleared (count = 0)'))
          .catch((error) => log('Badge clear error:', error));
      }
    }
  }
});

// Log final du statut
if (messaging) {
  log('Firebase Messaging Service Worker ready - FCM + WebSocket mode');
} else {
  log('Service Worker ready - WebSocket-only mode (Firebase not configured)');
}
