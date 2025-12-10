/**
 * Firebase Cloud Messaging Manager
 * Gère les notifications push via FCM
 *
 * Features:
 * - Demande de permission
 * - Gestion du FCM token
 * - Synchronisation avec le backend
 * - Messages foreground/background
 * - Token refresh automatique
 */

import { initializeApp, FirebaseApp, getApps } from 'firebase/app';
import {
  getMessaging,
  getToken,
  onMessage,
  deleteToken,
  isSupported as isMessagingSupported,
  Messaging,
  MessagePayload,
} from 'firebase/messaging';
import {
  getFirebaseConfig,
  getVapidKey,
  isFirebaseConfigured,
  notificationFeatureFlags,
  notificationConfig,
} from '@/firebase-config';
import { firebaseChecker } from './firebase-availability-checker';

export type NotificationPermission = 'default' | 'granted' | 'denied';

export interface FCMMessageData {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  url?: string;
  conversationId?: string;
  notificationId?: string;
  [key: string]: any;
}

interface FCMManagerOptions {
  debug?: boolean;
  onTokenReceived?: (token: string) => void;
  onTokenError?: (error: Error) => void;
  onMessage?: (payload: MessagePayload) => void;
  onPermissionChange?: (permission: NotificationPermission) => void;
}

class FCMManager {
  private app: FirebaseApp | null = null;
  private messaging: Messaging | null = null;
  private currentToken: string | null = null;
  private isInitialized: boolean = false;
  private options: FCMManagerOptions;
  private unsubscribeMessage: (() => void) | null = null;

  constructor(options: FCMManagerOptions = {}) {
    this.options = {
      debug: notificationFeatureFlags.debugNotifications,
      ...options,
    };
  }

  /**
   * Log helper
   */
  private log(...args: any[]): void {
    if (this.options.debug) {
      console.log('[FCM]', ...args);
    }
  }

  /**
   * Gestion des erreurs
   */
  private handleError(error: Error, context: string): void {
    console.error(`[FCM] Error in ${context}:`, error);
    this.options.onTokenError?.(error);
  }

  /**
   * Vérifie si FCM est supporté et configuré
   */
  public async isSupported(): Promise<boolean> {
    try {
      // Vérifier environnement navigateur
      if (typeof window === 'undefined') {
        this.log('Not in browser environment');
        return false;
      }

      // CRITICAL: Vérifier Firebase availability FIRST
      if (!firebaseChecker.isAvailable()) {
        this.log('Firebase not available - checker returned false');
        return false;
      }

      // Vérifier feature flag
      if (!firebaseChecker.isPushEnabled()) {
        this.log('Push notifications disabled by feature flag');
        return false;
      }

      // Vérifier support messaging
      const supported = await isMessagingSupported();
      this.log('FCM supported:', supported);

      return supported;
    } catch (error) {
      this.log('Support check failed:', error);
      return false;
    }
  }

  /**
   * Initialise Firebase et FCM
   */
  public async initialize(): Promise<boolean> {
    // CRITICAL: Vérifier Firebase availability avant toute initialisation
    if (!firebaseChecker.isAvailable()) {
      this.log('Firebase not available - skipping FCM initialization');
      return false;
    }

    if (this.isInitialized) {
      this.log('Already initialized');
      return true;
    }

    try {
      // Vérifier support
      const supported = await this.isSupported();
      if (!supported) {
        this.log('FCM not supported, skipping initialization');
        return false;
      }

      // Initialiser Firebase App
      const existingApps = getApps();
      if (existingApps.length > 0) {
        this.app = existingApps[0];
        this.log('Using existing Firebase app');
      } else {
        const config = getFirebaseConfig();
        this.app = initializeApp(config);
        this.log('Firebase app initialized');
      }

      // Initialiser Messaging
      this.messaging = getMessaging(this.app);
      this.log('FCM messaging initialized');

      // Écouter les messages foreground
      this.setupMessageListener();

      this.isInitialized = true;
      return true;
    } catch (error) {
      this.handleError(error as Error, 'initialize');
      return false;
    }
  }

  /**
   * Configure l'écoute des messages foreground
   */
  private setupMessageListener(): void {
    if (!this.messaging) return;

    try {
      this.unsubscribeMessage = onMessage(this.messaging, (payload) => {
        this.log('Message received (foreground):', payload);

        // Callback custom
        this.options.onMessage?.(payload);

        // Afficher notification si notification permission accordée
        if (Notification.permission === 'granted' && payload.notification) {
          this.showLocalNotification(payload);
        }
      });

      this.log('Message listener setup complete');
    } catch (error) {
      this.handleError(error as Error, 'setupMessageListener');
    }
  }

  /**
   * Affiche une notification locale (foreground)
   */
  private async showLocalNotification(payload: MessagePayload): Promise<void> {
    if (!payload.notification) return;

    const { title, body, image } = payload.notification;
    const data = payload.data || {};

    try {
      const registration = await navigator.serviceWorker.ready;

      await registration.showNotification(title || 'Notification', {
        body: body || '',
        icon: data.icon || notificationConfig.defaultNotificationOptions.icon,
        badge:
          data.badge || notificationConfig.defaultNotificationOptions.badge,
        image: image,
        data: data,
        tag: data.tag || notificationConfig.defaultNotificationOptions.tag,
        vibrate: notificationConfig.defaultNotificationOptions.vibrate,
        requireInteraction:
          notificationConfig.defaultNotificationOptions.requireInteraction,
      });

      this.log('Local notification shown');
    } catch (error) {
      this.handleError(error as Error, 'showLocalNotification');
    }
  }

  /**
   * Obtient le statut actuel de la permission
   */
  public getPermissionStatus(): NotificationPermission {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'default';
    }
    return Notification.permission as NotificationPermission;
  }

  /**
   * Vérifie si la permission est accordée
   */
  public hasPermission(): boolean {
    return this.getPermissionStatus() === 'granted';
  }

  /**
   * Demande la permission pour les notifications
   */
  public async requestPermission(): Promise<NotificationPermission> {
    // CRITICAL: Vérifier Firebase availability
    if (!firebaseChecker.isPushEnabled()) {
      this.log('Push notifications disabled - Firebase not available or feature flag off');
      return 'denied';
    }

    try {
      // Vérifier environnement
      if (typeof window === 'undefined' || !('Notification' in window)) {
        throw new Error('Notifications not supported');
      }

      // Initialiser si nécessaire
      if (!this.isInitialized) {
        const initialized = await this.initialize();
        if (!initialized) {
          throw new Error('Failed to initialize FCM');
        }
      }

      // Demander permission
      const permission = await Notification.requestPermission();
      this.log('Permission result:', permission);

      // Callback
      this.options.onPermissionChange?.(permission as NotificationPermission);

      // Si granted, obtenir le token
      if (permission === 'granted') {
        await this.getOrRefreshToken();
      }

      return permission as NotificationPermission;
    } catch (error) {
      this.handleError(error as Error, 'requestPermission');
      return 'denied';
    }
  }

  /**
   * Obtient ou rafraîchit le FCM token
   */
  public async getOrRefreshToken(): Promise<string | null> {
    if (!this.messaging) {
      this.log('Messaging not initialized');
      return null;
    }

    if (this.getPermissionStatus() !== 'granted') {
      this.log('Permission not granted');
      return null;
    }

    try {
      const vapidKey = getVapidKey();
      if (!vapidKey) {
        throw new Error('VAPID key not configured');
      }

      // Obtenir le token
      const token = await getToken(this.messaging, { vapidKey });
      this.log('Token obtained:', token.substring(0, 20) + '...');

      // Sauvegarder
      this.currentToken = token;

      // Callback
      this.options.onTokenReceived?.(token);

      return token;
    } catch (error) {
      this.handleError(error as Error, 'getOrRefreshToken');
      return null;
    }
  }

  /**
   * Obtient le token actuel (sans refresh)
   */
  public getCurrentToken(): string | null {
    return this.currentToken;
  }

  /**
   * Supprime le token (opt-out)
   */
  public async deleteToken(): Promise<boolean> {
    if (!this.messaging || !this.currentToken) {
      this.log('No token to delete');
      return true;
    }

    try {
      const success = await deleteToken(this.messaging);
      this.log('Token deleted:', success);

      if (success) {
        this.currentToken = null;
      }

      return success;
    } catch (error) {
      this.handleError(error as Error, 'deleteToken');
      return false;
    }
  }

  /**
   * Vérifie si on devrait demander la permission
   * (basé sur les feature flags et l'historique utilisateur)
   */
  public shouldPromptForPermission(): boolean {
    // Vérifier feature flag
    if (!notificationFeatureFlags.enablePushNotifications) {
      return false;
    }

    // Si déjà granted ou denied, ne pas redemander
    const status = this.getPermissionStatus();
    if (status !== 'default') {
      return false;
    }

    // Vérifier le localStorage pour le dernier refus
    if (typeof window !== 'undefined') {
      const lastDenied = localStorage.getItem('fcm_last_denied');
      if (lastDenied) {
        const daysSinceDenied =
          (Date.now() - parseInt(lastDenied)) / (1000 * 60 * 60 * 24);
        if (daysSinceDenied < notificationConfig.repromptAfterDenialDays) {
          this.log('Too soon to reprompt after denial');
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Enregistre un refus de permission
   */
  public recordPermissionDenial(): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('fcm_last_denied', Date.now().toString());
    }
  }

  /**
   * Nettoie et déconnecte
   */
  public async cleanup(): Promise<void> {
    this.log('Cleaning up...');

    // Désabonner du listener de messages
    if (this.unsubscribeMessage) {
      this.unsubscribeMessage();
      this.unsubscribeMessage = null;
    }

    this.isInitialized = false;
    this.currentToken = null;
    this.messaging = null;
    this.app = null;

    this.log('Cleanup complete');
  }
}

// Instance singleton
let fcmManagerInstance: FCMManager | null = null;

/**
 * Obtient l'instance singleton du FCMManager
 */
export function getFCMManager(options?: FCMManagerOptions): FCMManager {
  if (!fcmManagerInstance) {
    fcmManagerInstance = new FCMManager(options);
  }
  return fcmManagerInstance;
}

/**
 * Réinitialise l'instance singleton (tests)
 */
export async function resetFCMManager(): Promise<void> {
  if (fcmManagerInstance) {
    await fcmManagerInstance.cleanup();
    fcmManagerInstance = null;
  }
}

// Export des utilitaires
export const fcm = {
  /**
   * Vérifie si FCM est supporté
   */
  isSupported: async (): Promise<boolean> => {
    return getFCMManager().isSupported();
  },

  /**
   * Initialise FCM
   */
  initialize: async (): Promise<boolean> => {
    return getFCMManager().initialize();
  },

  /**
   * Demande la permission
   */
  requestPermission: async (): Promise<NotificationPermission> => {
    return getFCMManager().requestPermission();
  },

  /**
   * Obtient le token
   */
  getToken: async (): Promise<string | null> => {
    return getFCMManager().getOrRefreshToken();
  },

  /**
   * Obtient le token actuel
   */
  getCurrentToken: (): string | null => {
    return getFCMManager().getCurrentToken();
  },

  /**
   * Supprime le token
   */
  deleteToken: async (): Promise<boolean> => {
    return getFCMManager().deleteToken();
  },

  /**
   * Vérifie le statut de permission
   */
  getPermissionStatus: (): NotificationPermission => {
    return getFCMManager().getPermissionStatus();
  },

  /**
   * Vérifie si on a la permission
   */
  hasPermission: (): boolean => {
    return getFCMManager().hasPermission();
  },

  /**
   * Vérifie si on devrait demander la permission
   */
  shouldPrompt: (): boolean => {
    return getFCMManager().shouldPromptForPermission();
  },
};

export default fcm;
