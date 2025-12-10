# Guide complet : Badges PWA et Notifications Push

## Vue d'ensemble

Ce guide explique comment implémenter :
1. **Badges de notification** sur l'icône PWA (compteur de notifications non lues)
2. **Notifications push** pour envoyer des notifications même quand l'app est fermée

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                     UTILISATEUR                             │
│                                                             │
│  📱 PWA Installée                                          │
│  ├── Badge: [5]  ← Compteur notifications non lues        │
│  └── Notifications push ← Messages reçus                   │
└────────────────────────────────────────────────────────────┘
                        ▲
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐ ┌─────▼──────┐ ┌─────▼──────┐
│  Frontend    │ │   Service   │ │  Backend   │
│              │ │   Worker    │ │  Gateway   │
│ - Badge API  │ │ - Push API  │ │ - Web Push │
│ - Notif Perm │ │ - Handler   │ │ - VAPID    │
└──────────────┘ └─────────────┘ └────────────┘
```

## 1. Badges de notification PWA

### 1.1 API Badging

L'API Badging permet d'afficher un compteur sur l'icône de l'application PWA installée.

#### Support navigateur
- ✅ Chrome/Edge 81+
- ✅ Samsung Internet 14+
- ❌ Safari (pas encore supporté)
- ❌ Firefox (pas encore supporté)

#### Vérification du support

```typescript
// utils/badge.ts
export const isBadgingSupported = (): boolean => {
  return 'setAppBadge' in navigator && 'clearAppBadge' in navigator;
};
```

### 1.2 Mise à jour du badge

```typescript
// utils/badge.ts
/**
 * Met à jour le badge de l'application avec le nombre de notifications non lues
 * @param count Nombre de notifications (0 = pas de badge)
 */
export async function updateAppBadge(count: number): Promise<void> {
  if (!isBadgingSupported()) {
    console.warn('Badge API not supported');
    return;
  }

  try {
    if (count === 0) {
      // Supprimer le badge
      await (navigator as any).clearAppBadge();
    } else {
      // Afficher le badge avec le compteur
      await (navigator as any).setAppBadge(count);
    }
  } catch (error) {
    console.error('Error updating app badge:', error);
  }
}
```

### 1.3 Hook React pour les badges

```typescript
// hooks/use-app-badge.ts
'use client';

import { useEffect } from 'react';
import { isBadgingSupported, updateAppBadge } from '@/utils/badge';

export function useAppBadge(unreadCount: number) {
  useEffect(() => {
    if (!isBadgingSupported()) {
      return;
    }

    updateAppBadge(unreadCount);

    // Cleanup: supprimer le badge quand le composant est démonté
    return () => {
      updateAppBadge(0);
    };
  }, [unreadCount]);
}
```

### 1.4 Utilisation dans l'app

```typescript
// app/layout.tsx ou composant principal
'use client';

import { useAppBadge } from '@/hooks/use-app-badge';
import { useNotifications } from '@/hooks/use-notifications';

export default function RootLayout({ children }) {
  const { unreadCount } = useNotifications();

  // Met à jour automatiquement le badge
  useAppBadge(unreadCount);

  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
```

## 2. Notifications Push

### 2.1 Prérequis

#### VAPID Keys (Voluntary Application Server Identification)

Générer une paire de clés VAPID :

```bash
# Installer web-push si pas encore fait
npm install -g web-push

# Générer les clés VAPID
web-push generate-vapid-keys

# Output:
# Public Key: BEo...XYZ
# Private Key: abc...123
```

Ajouter dans `.env` :

```bash
# Backend (.env)
VAPID_PUBLIC_KEY=BEo...XYZ
VAPID_PRIVATE_KEY=abc...123
VAPID_SUBJECT=mailto:contact@meeshy.com
```

```bash
# Frontend (.env.local)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BEo...XYZ
```

### 2.2 Service Worker

#### Créer le service worker

```typescript
// public/sw.js (ou service-worker.ts compilé)
/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

// Installation du service worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  self.skipWaiting();
});

// Activation
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(self.clients.claim());
});

// Gestion des notifications push
self.addEventListener('push', async (event) => {
  console.log('[SW] Push received:', event);

  if (!event.data) {
    console.log('[SW] Push event but no data');
    return;
  }

  try {
    const data = event.data.json();
    const { title, body, icon, badge, data: notificationData } = data;

    const options: NotificationOptions = {
      body,
      icon: icon || '/icons/icon-192x192.png',
      badge: badge || '/icons/badge-72x72.png',
      data: notificationData,
      vibrate: [200, 100, 200],
      tag: notificationData?.conversationId || 'default',
      renotify: true,
      requireInteraction: false,
      actions: [
        {
          action: 'open',
          title: 'Ouvrir',
          icon: '/icons/open.png',
        },
        {
          action: 'close',
          title: 'Fermer',
          icon: '/icons/close.png',
        },
      ],
    };

    event.waitUntil(self.registration.showNotification(title, options));

    // Mettre à jour le badge
    const unreadCount = notificationData?.unreadCount || 1;
    if ('setAppBadge' in navigator) {
      (navigator as any).setAppBadge(unreadCount);
    }
  } catch (error) {
    console.error('[SW] Error showing notification:', error);
  }
});

// Gestion du clic sur la notification
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);

  event.notification.close();

  const action = event.action;
  const notificationData = event.notification.data;

  if (action === 'close') {
    return; // Juste fermer la notification
  }

  // Ouvrir ou focus l'application
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Construire l'URL de destination
      let targetUrl = '/';
      if (notificationData?.conversationId) {
        targetUrl = `/conversations/${notificationData.conversationId}`;
      }

      // Chercher un client existant avec cette URL
      for (const client of clients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }

      // Chercher un client ouvert
      if (clients.length > 0 && 'focus' in clients[0]) {
        const client = clients[0];
        client.focus();
        // Naviguer vers l'URL cible via postMessage
        client.postMessage({
          type: 'NOTIFICATION_CLICKED',
          url: targetUrl,
        });
        return client;
      }

      // Ouvrir une nouvelle fenêtre
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })()
  );
});

// Fermeture de la notification
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed:', event);
  // Optionnel : envoyer analytics
});
```

### 2.3 Enregistrement du service worker

```typescript
// utils/service-worker.ts
/**
 * Enregistre le service worker et retourne l'instance
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    console.log('[SW] Registered:', registration);

    // Vérifier les mises à jour
    registration.addEventListener('updatefound', () => {
      console.log('[SW] Update found');
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[SW] New version available');
            // Optionnel : afficher un toast pour recharger
          }
        });
      }
    });

    return registration;
  } catch (error) {
    console.error('[SW] Registration failed:', error);
    return null;
  }
}
```

### 2.4 Demande de permission et subscription

```typescript
// utils/push-notifications.ts
import { registerServiceWorker } from './service-worker';

/**
 * Demande la permission pour les notifications push
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    throw new Error('Notifications not supported');
  }

  const permission = await Notification.requestPermission();
  return permission;
}

/**
 * Souscrit aux notifications push et retourne la subscription
 */
export async function subscribeToPushNotifications(
  vapidPublicKey: string
): Promise<PushSubscription | null> {
  try {
    // 1. Enregistrer le service worker
    const registration = await registerServiceWorker();
    if (!registration) {
      throw new Error('Service worker registration failed');
    }

    // 2. Demander la permission
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      console.warn('Notification permission denied');
      return null;
    }

    // 3. Vérifier si déjà souscrit
    let subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      console.log('[Push] Already subscribed');
      return subscription;
    }

    // 4. Créer une nouvelle souscription
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true, // Obligatoire
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    console.log('[Push] Subscribed:', subscription);
    return subscription;
  } catch (error) {
    console.error('[Push] Subscription failed:', error);
    return null;
  }
}

/**
 * Se désabonner des notifications push
 */
export async function unsubscribeFromPushNotifications(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      return false;
    }

    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      return false;
    }

    const success = await subscription.unsubscribe();
    console.log('[Push] Unsubscribed:', success);
    return success;
  } catch (error) {
    console.error('[Push] Unsubscribe failed:', error);
    return false;
  }
}

/**
 * Convertit une clé VAPID base64 en Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}
```

### 2.5 Hook React pour les notifications push

```typescript
// hooks/use-push-notifications.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  requestNotificationPermission,
} from '@/utils/push-notifications';

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isSubscribing, setIsSubscribing] = useState(false);

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

  // Vérifier l'état initial
  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }

    // Récupérer la subscription existante
    (async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        const existingSub = await registration.pushManager.getSubscription();
        setSubscription(existingSub);
      }
    })();
  }, []);

  // Souscrire aux notifications
  const subscribe = useCallback(async () => {
    if (!vapidPublicKey) {
      console.error('VAPID public key not configured');
      return null;
    }

    setIsSubscribing(true);

    try {
      const sub = await subscribeToPushNotifications(vapidPublicKey);
      setSubscription(sub);
      setPermission(Notification.permission);

      // Envoyer la subscription au backend
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(sub.toJSON()),
        });
      }

      return sub;
    } catch (error) {
      console.error('Subscribe error:', error);
      return null;
    } finally {
      setIsSubscribing(false);
    }
  }, [vapidPublicKey]);

  // Se désabonner
  const unsubscribe = useCallback(async () => {
    setIsSubscribing(true);

    try {
      const success = await unsubscribeFromPushNotifications();

      if (success) {
        setSubscription(null);

        // Informer le backend
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
        });
      }

      return success;
    } catch (error) {
      console.error('Unsubscribe error:', error);
      return false;
    } finally {
      setIsSubscribing(false);
    }
  }, []);

  return {
    permission,
    subscription,
    isSubscribed: !!subscription,
    isSubscribing,
    subscribe,
    unsubscribe,
  };
}
```

### 2.6 Composant UI pour activer les notifications

```typescript
// components/notifications/PushNotificationSettings.tsx
'use client';

import { usePushNotifications } from '@/hooks/use-push-notifications';
import { Button } from '@/components/ui/button';
import { Bell, BellOff } from 'lucide-react';

export function PushNotificationSettings() {
  const { permission, isSubscribed, isSubscribing, subscribe, unsubscribe } =
    usePushNotifications();

  if (permission === 'denied') {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
        <p className="text-sm text-red-400">
          Notifications bloquées. Activez-les dans les paramètres du navigateur.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isSubscribed ? (
            <Bell className="w-5 h-5 text-green-400" />
          ) : (
            <BellOff className="w-5 h-5 text-gray-400" />
          )}
          <div>
            <h3 className="text-sm font-medium text-white">Notifications push</h3>
            <p className="text-xs text-gray-400">
              {isSubscribed
                ? 'Vous recevez les notifications'
                : 'Activez pour recevoir des notifications'}
            </p>
          </div>
        </div>

        <Button
          onClick={isSubscribed ? unsubscribe : subscribe}
          disabled={isSubscribing}
          variant={isSubscribed ? 'destructive' : 'default'}
          size="sm"
        >
          {isSubscribing
            ? 'Chargement...'
            : isSubscribed
            ? 'Désactiver'
            : 'Activer'}
        </Button>
      </div>
    </div>
  );
}
```

## 3. Backend - API pour envoyer les notifications

### 3.1 Types TypeScript

```typescript
// shared/types/push-notification.ts
export interface PushSubscription {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: {
    conversationId?: string;
    messageId?: string;
    senderId?: string;
    unreadCount?: number;
    [key: string]: any;
  };
}
```

### 3.2 Service de gestion des subscriptions

```typescript
// gateway/src/services/push-notification.service.ts
import webPush from 'web-push';
import type { FastifyInstance } from 'fastify';
import type { PushNotificationPayload } from '@shared/types';

export class PushNotificationService {
  private fastify: FastifyInstance;

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify;

    // Configuration VAPID
    webPush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:contact@meeshy.com',
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );
  }

  /**
   * Enregistre une subscription pour un utilisateur
   */
  async saveSubscription(userId: string, subscription: any): Promise<void> {
    await this.fastify.prisma.pushSubscription.upsert({
      where: {
        userId_endpoint: {
          userId,
          endpoint: subscription.endpoint,
        },
      },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        expirationTime: subscription.expirationTime,
      },
      update: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        expirationTime: subscription.expirationTime,
      },
    });
  }

  /**
   * Supprime une subscription
   */
  async removeSubscription(userId: string, endpoint: string): Promise<void> {
    await this.fastify.prisma.pushSubscription.delete({
      where: {
        userId_endpoint: {
          userId,
          endpoint,
        },
      },
    });
  }

  /**
   * Envoie une notification push à un utilisateur
   */
  async sendNotification(
    userId: string,
    payload: PushNotificationPayload
  ): Promise<void> {
    // Récupérer toutes les subscriptions de l'utilisateur
    const subscriptions = await this.fastify.prisma.pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) {
      console.log(`No push subscriptions for user ${userId}`);
      return;
    }

    // Envoyer à toutes les subscriptions
    const promises = subscriptions.map(async (sub) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          JSON.stringify(payload)
        );

        console.log(`Push notification sent to ${userId}`);
      } catch (error: any) {
        console.error(`Failed to send push notification:`, error);

        // Si la subscription est expirée ou invalide, la supprimer
        if (error.statusCode === 410 || error.statusCode === 404) {
          await this.removeSubscription(userId, sub.endpoint);
        }
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Envoie une notification à plusieurs utilisateurs
   */
  async sendNotificationToMultiple(
    userIds: string[],
    payload: PushNotificationPayload
  ): Promise<void> {
    const promises = userIds.map((userId) => this.sendNotification(userId, payload));
    await Promise.allSettled(promises);
  }
}
```

### 3.3 Routes API

```typescript
// gateway/src/routes/push-notifications.ts
import type { FastifyInstance } from 'fastify';
import { PushNotificationService } from '../services/push-notification.service';

export async function pushNotificationRoutes(fastify: FastifyInstance) {
  const pushService = new PushNotificationService(fastify);

  // Souscrire aux notifications
  fastify.post('/subscribe', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const authContext = (request as any).authContext;
    const userId = authContext.registeredUser.id;
    const subscription = request.body;

    await pushService.saveSubscription(userId, subscription);

    return reply.send({ success: true });
  });

  // Se désabonner
  fastify.post('/unsubscribe', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const authContext = (request as any).authContext;
    const userId = authContext.registeredUser.id;
    const { endpoint } = request.body as any;

    if (endpoint) {
      await pushService.removeSubscription(userId, endpoint);
    }

    return reply.send({ success: true });
  });

  // Test: envoyer une notification (admin only)
  fastify.post('/test', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const authContext = (request as any).authContext;
    const userId = authContext.registeredUser.id;

    await pushService.sendNotification(userId, {
      title: 'Test Notification',
      body: 'Ceci est une notification de test',
      icon: '/icons/icon-192x192.png',
      data: {
        test: true,
      },
    });

    return reply.send({ success: true });
  });
}
```

### 3.4 Intégration avec les messages

```typescript
// gateway/src/socketio/MeeshySocketIOManager.ts
// Dans la méthode handleNewMessage ou équivalent

async handleNewMessage(message: Message, conversationId: string) {
  // ... code existant ...

  // Récupérer les participants de la conversation
  const participants = await this.getConversationParticipants(conversationId);

  // Filtrer pour ne pas notifier l'expéditeur
  const recipientIds = participants
    .filter((p) => p.id !== message.senderId)
    .map((p) => p.id);

  // Compter les non lus pour chaque utilisateur
  const unreadCounts = await Promise.all(
    recipientIds.map(async (userId) => ({
      userId,
      count: await this.getUnreadCount(userId),
    }))
  );

  // Envoyer les notifications push
  const pushService = new PushNotificationService(this.fastify);

  for (const recipient of recipientIds) {
    const unreadCount = unreadCounts.find((u) => u.userId === recipient)?.count || 0;

    await pushService.sendNotification(recipient, {
      title: `Nouveau message de ${message.sender?.displayName || 'Un utilisateur'}`,
      body: message.content.substring(0, 100),
      icon: message.sender?.avatar || '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      data: {
        conversationId,
        messageId: message.id,
        senderId: message.senderId,
        unreadCount,
      },
    });
  }
}
```

### 3.5 Migration Prisma

```prisma
// shared/schema.prisma
model PushSubscription {
  id             String   @id @default(auto()) @map("_id") @db.ObjectId
  userId         String   @db.ObjectId
  endpoint       String
  p256dh         String   // Clé publique
  auth           String   // Clé d'authentification
  expirationTime Int?     // Timestamp d'expiration
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, endpoint])
  @@index([userId])
}
```

## 4. Résumé de l'implémentation

### Étapes pour l'utilisateur

1. **Installer la PWA** (Add to Home Screen)
2. **Activer les notifications** dans les paramètres de l'app
3. **Autoriser** les notifications dans le navigateur
4. **Recevoir** les notifications même quand l'app est fermée
5. **Badge** mis à jour automatiquement avec le nombre de non-lus

### Checklist technique

- ☐ Générer les clés VAPID
- ☐ Configurer les variables d'environnement
- ☐ Créer le service worker (`/public/sw.js`)
- ☐ Implémenter les utils (badge, push, service-worker)
- ☐ Créer les hooks React
- ☐ Ajouter la migration Prisma
- ☐ Implémenter le service backend
- ☐ Créer les routes API
- ☐ Intégrer avec le système de messages
- ☐ Tester sur mobile (Android + Chrome/Edge)

### Testing

```bash
# 1. Installer la PWA sur Android
# 2. Activer les notifications
# 3. Envoyer un message depuis un autre compte
# 4. Vérifier la notification push
# 5. Vérifier le badge sur l'icône
```

## 5. Limitations et considérations

### Limitations
- **iOS Safari** : Pas de support des notifications push pour les PWA (iOS 16.4+) mais limité
- **Badge API** : Chrome/Edge uniquement
- **Service Worker** : Requis HTTPS (sauf localhost)

### Bonnes pratiques
- Toujours demander la permission au bon moment (pas au démarrage)
- Limiter le nombre de notifications
- Grouper les notifications par conversation
- Permettre de désactiver les notifications par conversation
- Nettoyer les subscriptions expirées

### Sécurité
- VAPID keys doivent être sécurisées (variables d'environnement)
- Valider les subscriptions côté serveur
- Rate limiting sur l'envoi de notifications
- Ne pas envoyer d'informations sensibles dans les notifications

## 6. Ressources

- [MDN - Push API](https://developer.mozilla.org/fr/docs/Web/API/Push_API)
- [MDN - Badging API](https://developer.mozilla.org/en-US/docs/Web/API/Badging_API)
- [Web Push Protocol](https://datatracker.ietf.org/doc/html/rfc8030)
- [VAPID](https://datatracker.ietf.org/doc/html/rfc8292)
