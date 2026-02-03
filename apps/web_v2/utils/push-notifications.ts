/**
 * PUSH NOTIFICATIONS UTILITIES
 * Gestion des notifications push avec Web Push API
 */

import { registerServiceWorker } from './service-worker';

/**
 * Demande la permission pour les notifications push
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    throw new Error('Notifications not supported on this browser');
  }

  const permission = await Notification.requestPermission();
  console.log('[Push] Permission:', permission);
  return permission;
}

/**
 * Vérifie si les notifications push sont supportées
 */
export function isPushNotificationSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Souscrit aux notifications push et retourne la subscription
 *
 * @param vapidPublicKey Clé publique VAPID du serveur
 * @returns PushSubscription ou null si échec
 */
export async function subscribeToPushNotifications(
  vapidPublicKey: string
): Promise<PushSubscription | null> {
  if (!isPushNotificationSupported()) {
    throw new Error('Push notifications not supported');
  }

  try {
    // 1. Enregistrer le service worker
    const registration = await registerServiceWorker();
    if (!registration) {
      throw new Error('Service worker registration failed');
    }

    // 2. Demander la permission
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      console.warn('[Push] Notification permission denied');
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
      userVisibleOnly: true, // Obligatoire - toutes les notifications doivent être visibles
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    console.log('[Push] Subscribed:', subscription.endpoint);
    return subscription;
  } catch (error) {
    console.error('[Push] Subscription failed:', error);
    return null;
  }
}

/**
 * Se désabonner des notifications push
 *
 * @returns true si succès, false sinon
 */
export async function unsubscribeFromPushNotifications(): Promise<boolean> {
  if (!isPushNotificationSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      console.warn('[Push] No service worker registration found');
      return false;
    }

    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      console.warn('[Push] No subscription found');
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
 * Récupère la subscription actuelle
 *
 * @returns PushSubscription ou null si pas de subscription
 */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushNotificationSupported()) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      return null;
    }

    return await registration.pushManager.getSubscription();
  } catch (error) {
    console.error('[Push] Get subscription failed:', error);
    return null;
  }
}

/**
 * Convertit une clé VAPID base64 URL-safe en Uint8Array
 *
 * @param base64String Clé VAPID en base64
 * @returns Uint8Array pour applicationServerKey
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

/**
 * Teste si l'utilisateur peut recevoir des notifications
 * (permission accordée ET souscription active)
 */
export async function canReceivePushNotifications(): Promise<boolean> {
  if (!isPushNotificationSupported()) {
    return false;
  }

  if (Notification.permission !== 'granted') {
    return false;
  }

  const subscription = await getCurrentSubscription();
  return subscription !== null;
}
