/**
 * USE PUSH NOTIFICATIONS HOOK
 * Hook React pour gérer les notifications push
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  getCurrentSubscription,
  isPushNotificationSupported,
  canReceivePushNotifications,
} from '@/utils/push-notifications';
import { logger } from '@/utils/logger';

interface UsePushNotificationsReturn {
  /** Permission actuelle pour les notifications */
  permission: NotificationPermission;
  /** Subscription active ou null */
  subscription: PushSubscription | null;
  /** True si souscrit aux notifications push */
  isSubscribed: boolean;
  /** True pendant une opération de souscription/désouscription */
  isLoading: boolean;
  /** True si les notifications push sont supportées */
  isSupported: boolean;
  /** Souscrire aux notifications push */
  subscribe: () => Promise<PushSubscription | null>;
  /** Se désabonner des notifications push */
  unsubscribe: () => Promise<boolean>;
  /** Recharger l'état de la subscription */
  refresh: () => Promise<void>;
}

/**
 * Hook pour gérer les notifications push
 *
 * @returns État et fonctions pour gérer les notifications push
 *
 * @example
 * ```tsx
 * function NotificationSettings() {
 *   const {
 *     permission,
 *     isSubscribed,
 *     isLoading,
 *     subscribe,
 *     unsubscribe,
 *   } = usePushNotifications();
 *
 *   return (
 *     <div>
 *       <p>Permission: {permission}</p>
 *       <button
 *         onClick={isSubscribed ? unsubscribe : subscribe}
 *         disabled={isLoading}
 *       >
 *         {isSubscribed ? 'Désactiver' : 'Activer'}
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */
export function usePushNotifications(): UsePushNotificationsReturn {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSupported] = useState(isPushNotificationSupported());

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  // Charger l'état initial
  const refresh = useCallback(async () => {
    if (!isSupported) {
      return;
    }

    try {
      // Mettre à jour la permission
      if ('Notification' in window) {
        setPermission(Notification.permission);
      }

      // Récupérer la subscription existante
      const currentSub = await getCurrentSubscription();
      setSubscription(currentSub);

      logger.debug('[usePushNotifications]', 'State refreshed', {
        permission: Notification.permission,
        hasSubscription: !!currentSub,
      });
    } catch (error) {
      logger.error('[usePushNotifications]', 'Failed to refresh state', { error });
    }
  }, [isSupported]);

  // Charger au montage
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Souscrire aux notifications
  const subscribe = useCallback(async () => {
    if (!isSupported) {
      logger.error('[usePushNotifications]', 'Push notifications not supported');
      return null;
    }

    if (!vapidPublicKey) {
      logger.error('[usePushNotifications]', 'VAPID public key not configured');
      return null;
    }

    setIsLoading(true);

    try {
      // Souscrire
      const sub = await subscribeToPushNotifications(vapidPublicKey);

      if (sub) {
        setSubscription(sub);
        setPermission(Notification.permission);

        // Envoyer la subscription au backend
        try {
          const response = await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(sub.toJSON()),
            credentials: 'include',
          });

          if (!response.ok) {
            throw new Error('Failed to save subscription to server');
          }

          logger.info('[usePushNotifications]', 'Subscribed successfully');
        } catch (error) {
          logger.error('[usePushNotifications]', 'Failed to save subscription to server', { error });
          // La subscription locale est quand même créée, on continue
        }
      }

      return sub;
    } catch (error) {
      logger.error('[usePushNotifications]', 'Subscribe error', { error });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, vapidPublicKey]);

  // Se désabonner
  const unsubscribe = useCallback(async () => {
    setIsLoading(true);

    try {
      const success = await unsubscribeFromPushNotifications();

      if (success) {
        setSubscription(null);

        // Informer le backend
        try {
          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            credentials: 'include',
          });

          logger.info('[usePushNotifications]', 'Unsubscribed successfully');
        } catch (error) {
          logger.error('[usePushNotifications]', 'Failed to notify server of unsubscription', { error });
        }
      }

      return success;
    } catch (error) {
      logger.error('[usePushNotifications]', 'Unsubscribe error', { error });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    permission,
    subscription,
    isSubscribed: !!subscription,
    isLoading,
    isSupported,
    subscribe,
    unsubscribe,
    refresh,
  };
}

/**
 * Hook simple pour vérifier si l'utilisateur peut recevoir des notifications
 *
 * @returns True si les notifications push sont actives
 *
 * @example
 * ```tsx
 * function App() {
 *   const canReceive = useCanReceivePushNotifications();
 *
 *   return (
 *     <div>
 *       {canReceive ? '✅ Notifications activées' : '❌ Notifications désactivées'}
 *     </div>
 *   );
 * }
 * ```
 */
export function useCanReceivePushNotifications(): boolean {
  const [canReceive, setCanReceive] = useState(false);

  useEffect(() => {
    canReceivePushNotifications().then(setCanReceive);
  }, []);

  return canReceive;
}
