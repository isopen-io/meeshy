/**
 * Hook React pour gérer les notifications push via Firebase Cloud Messaging
 * Simplifie l'intégration FCM dans les composants
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { fcm, NotificationPermission } from '@/utils/fcm-manager';
import { iosNotifications } from '@/utils/ios-notification-manager';
import { pushTokenService } from '@/services/push-token.service';
import { swRegistration } from '@/utils/service-worker-registration';
import { firebaseChecker } from '@/utils/firebase-availability-checker';

interface UseFCMNotificationsOptions {
  /**
   * Enregistrer automatiquement le Service Worker
   * @default true
   */
  autoRegisterServiceWorker?: boolean;

  /**
   * Synchroniser automatiquement le token avec le backend quand la permission est accordée
   * @default true
   */
  autoSyncToken?: boolean;

  /**
   * Callback quand le token est obtenu
   */
  onTokenReceived?: (token: string) => void;

  /**
   * Callback quand une erreur se produit
   */
  onError?: (error: Error) => void;

  /**
   * Debug mode
   */
  debug?: boolean;
}

interface FCMNotificationState {
  isSupported: boolean;
  permission: NotificationPermission;
  isLoading: boolean;
  error: string | null;
  token: string | null;
  isIOS: boolean;
  iosCapabilities: any | null;
}

export function useFCMNotifications(options: UseFCMNotificationsOptions = {}) {
  const {
    autoRegisterServiceWorker = true,
    autoSyncToken = true,
    onTokenReceived,
    onError,
    debug = false,
  } = options;

  const [state, setState] = useState<FCMNotificationState>({
    isSupported: false,
    permission: 'default',
    isLoading: true,
    error: null,
    token: null,
    isIOS: false,
    iosCapabilities: null,
  });

  /**
   * Log helper
   */
  const log = useCallback((...args: any[]) => {
    if (debug) {
      console.log('[useFCMNotifications]', ...args);
    }
  }, [debug]);

  /**
   * Initialise le système de notifications
   */
  useEffect(() => {
    const initialize = async () => {
      try {
        log('Initializing...');

        // CRITICAL: Vérifier Firebase disponibilité AVANT toute opération
        if (!firebaseChecker.isAvailable()) {
          log('Firebase not available - FCM notifications disabled');
          setState({
            isSupported: false,
            permission: 'default',
            isLoading: false,
            error: null,
            token: null,
            isIOS: iosNotifications.isIOS(),
            iosCapabilities: null,
          });
          return; // Sortir tôt, pas d'initialisation FCM
        }

        // Enregistrer le Service Worker
        if (autoRegisterServiceWorker) {
          const registered = await swRegistration.register('/sw.js');
          log('Service Worker registered:', registered);
        }

        // Vérifier support FCM
        const supported = await fcm.isSupported();
        log('FCM supported:', supported);

        // Détecter iOS
        const ios = iosNotifications.isIOS();
        const iosCapabilities = ios ? iosNotifications.getCapabilities() : null;
        log('iOS:', ios, 'Capabilities:', iosCapabilities);

        // Vérifier permission actuelle
        const permission = fcm.getPermissionStatus();
        log('Current permission:', permission);

        // Obtenir le token si permission accordée
        let token: string | null = null;
        if (permission === 'granted') {
          // Initialiser FCM
          await fcm.initialize();

          // Obtenir le token
          token = await fcm.getToken();
          log('Token obtained:', token?.substring(0, 20) + '...');

          // Synchroniser avec le backend
          if (token && autoSyncToken) {
            const synced = await pushTokenService.sync(token);
            log('Token synced with backend:', synced);
          }

          // Callback
          if (token) {
            onTokenReceived?.(token);
          }
        }

        setState({
          isSupported: supported,
          permission,
          isLoading: false,
          error: null,
          token,
          isIOS: ios,
          iosCapabilities,
        });
      } catch (error) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Initialization failed',
        }));
        onError?.(error as Error);
      }
    };

    initialize();
  }, [autoRegisterServiceWorker, autoSyncToken, onTokenReceived, onError, log]);

  /**
   * Demande la permission de notifications
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      log('Requesting permission...');

      setState(prev => ({ ...prev, isLoading: true, error: null }));

      // Initialiser FCM
      await fcm.initialize();

      // Demander permission
      const permission = await fcm.requestPermission();
      log('Permission result:', permission);

      if (permission === 'granted') {
        // Obtenir le token
        const token = await fcm.getToken();
        log('Token obtained:', token?.substring(0, 20) + '...');

        if (token) {
          // Synchroniser avec backend
          if (autoSyncToken) {
            await pushTokenService.sync(token);
            log('Token synced with backend');
          }

          // Callback
          onTokenReceived?.(token);

          setState(prev => ({
            ...prev,
            permission,
            token,
            isLoading: false,
          }));

          return true;
        }
      }

      setState(prev => ({
        ...prev,
        permission,
        isLoading: false,
      }));

      return false;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Permission request failed',
      }));
      onError?.(error as Error);
      return false;
    }
  }, [autoSyncToken, onTokenReceived, onError, log]);

  /**
   * Révoque la permission (supprime le token)
   */
  const revokePermission = useCallback(async (): Promise<boolean> => {
    try {
      log('Revoking permission...');

      setState(prev => ({ ...prev, isLoading: true, error: null }));

      // Supprimer le token du backend
      if (state.token) {
        await pushTokenService.delete(state.token);
        log('Token removed from backend');
      }

      // Supprimer le token FCM
      await fcm.deleteToken();
      log('FCM token deleted');

      setState(prev => ({
        ...prev,
        token: null,
        isLoading: false,
      }));

      return true;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Revoke failed',
      }));
      onError?.(error as Error);
      return false;
    }
  }, [state.token, onError, log]);

  /**
   * Rafraîchit le token
   */
  const refreshToken = useCallback(async (): Promise<string | null> => {
    try {
      log('Refreshing token...');

      if (state.permission !== 'granted') {
        log('Permission not granted, cannot refresh token');
        return null;
      }

      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const token = await fcm.getToken();
      log('New token:', token?.substring(0, 20) + '...');

      if (token && autoSyncToken) {
        await pushTokenService.sync(token);
        log('Token synced with backend');
      }

      setState(prev => ({
        ...prev,
        token,
        isLoading: false,
      }));

      if (token) {
        onTokenReceived?.(token);
      }

      return token;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Token refresh failed',
      }));
      onError?.(error as Error);
      return null;
    }
  }, [state.permission, autoSyncToken, onTokenReceived, onError, log]);

  /**
   * Vérifie si on devrait afficher le prompt de permission
   */
  const shouldShowPrompt = useCallback((): boolean => {
    // Ne pas afficher si déjà granted ou denied
    if (state.permission !== 'default') {
      return false;
    }

    // Vérifier si FCM pense qu'on devrait afficher
    return fcm.shouldPrompt();
  }, [state.permission]);

  /**
   * Vérifie si on devrait afficher le prompt d'installation iOS
   */
  const shouldShowIOSInstallPrompt = useCallback((): boolean => {
    return iosNotifications.shouldShowInstallPrompt();
  }, []);

  return {
    // État
    ...state,

    // Actions
    requestPermission,
    revokePermission,
    refreshToken,

    // Helpers
    shouldShowPrompt,
    shouldShowIOSInstallPrompt,
    hasPermission: state.permission === 'granted',
    isPermissionDenied: state.permission === 'denied',

    // Debug
    getDebugInfo: () => ({
      ...state,
      shouldShowPrompt: shouldShowPrompt(),
      shouldShowIOSInstallPrompt: shouldShowIOSInstallPrompt(),
      iosDebugReport: state.isIOS ? iosNotifications.getDebugReport() : null,
    }),
  };
}

/**
 * Hook simplifié pour juste activer les notifications FCM
 * Usage: const { requestPermission } = useSimpleFCMNotifications()
 */
export function useSimpleFCMNotifications() {
  return useFCMNotifications({
    autoRegisterServiceWorker: true,
    autoSyncToken: true,
  });
}
