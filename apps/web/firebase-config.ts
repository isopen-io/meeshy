/**
 * Firebase Configuration pour Meeshy
 * Gère la configuration Firebase pour différents environnements
 * Utilise firebase-availability-checker pour garantir la disponibilité
 */

import { FirebaseOptions, FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { firebaseChecker } from '@/utils/firebase-availability-checker';

/**
 * Configuration Firebase par environnement
 */
interface FirebaseConfig {
  development: FirebaseOptions;
  staging: FirebaseOptions;
  production: FirebaseOptions;
}

/**
 * Obtient la configuration Firebase pour l'environnement actuel
 */
export function getFirebaseConfig(): FirebaseOptions {
  const env = process.env.NODE_ENV || 'development';

  // Configuration par environnement
  const config: FirebaseOptions = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  // Validation
  const requiredFields: (keyof FirebaseOptions)[] = [
    'apiKey',
    'authDomain',
    'projectId',
    'messagingSenderId',
    'appId'
  ];

  const missingFields = requiredFields.filter(field => !config[field]);

  if (missingFields.length > 0) {
    console.warn(
      '[Firebase] Missing configuration fields:',
      missingFields.join(', '),
      '\nPush notifications will not be available.'
    );
  }

  return config;
}

/**
 * Clé VAPID pour web push notifications
 */
export function getVapidKey(): string | undefined {
  return process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
}

/**
 * Vérifie si Firebase est configuré
 */
export function isFirebaseConfigured(): boolean {
  const config = getFirebaseConfig();
  return !!(
    config.apiKey &&
    config.authDomain &&
    config.projectId &&
    config.messagingSenderId &&
    config.appId
  );
}

/**
 * Feature flags pour les notifications
 */
export const notificationFeatureFlags = {
  /**
   * Active/désactive les push notifications
   */
  enablePushNotifications:
    process.env.NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS === 'true',

  /**
   * Active/désactive les badges PWA
   */
  enablePWABadges: process.env.NEXT_PUBLIC_ENABLE_PWA_BADGES !== 'false', // true par défaut

  /**
   * Active le mode debug pour les notifications
   */
  debugNotifications: process.env.NEXT_PUBLIC_DEBUG_NOTIFICATIONS === 'true',
};

/**
 * Configuration des notifications
 */
export const notificationConfig = {
  /**
   * Délai avant de demander la permission (ms)
   * Laisser l'utilisateur utiliser l'app d'abord
   */
  permissionPromptDelay: 3 * 60 * 1000, // 3 minutes

  /**
   * Nombre minimum d'interactions avant de demander la permission
   */
  minInteractionsBeforePrompt: 5,

  /**
   * Réafficher le prompt après refus (jours)
   */
  repromptAfterDenialDays: 30,

  /**
   * Token refresh interval (heures)
   */
  tokenRefreshInterval: 24,

  /**
   * Options par défaut pour les notifications
   */
  defaultNotificationOptions: {
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    vibrate: [200, 100, 200],
    requireInteraction: false,
    tag: 'meeshy-notification',
  },
};

/**
 * Obtient l'instance Firebase App (avec vérification de disponibilité)
 * @returns FirebaseApp instance ou null si Firebase n'est pas disponible
 */
export function getFirebaseApp(): FirebaseApp | null {
  // CRITICAL: Vérifier disponibilité avant toute opération
  if (!firebaseChecker.isAvailable()) {
    return null;
  }

  try {
    // Vérifier si une app existe déjà
    const apps = getApps();
    if (apps.length > 0) {
      return apps[0];
    }

    // Initialiser nouvelle app
    const config = getFirebaseConfig();
    return initializeApp(config);
  } catch (error) {
    console.error('[Firebase Config] Failed to get/initialize app:', error);
    return null;
  }
}

export default getFirebaseConfig;
