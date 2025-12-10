/**
 * USE APP BADGE HOOK
 * Hook React pour gérer le badge de l'application PWA
 */

'use client';

import { useEffect } from 'react';
import { isBadgingSupported, updateAppBadge, clearAppBadge } from '@/utils/badge';
import { logger } from '@/utils/logger';

/**
 * Met à jour automatiquement le badge de l'application avec le nombre de notifications non lues
 *
 * @param unreadCount Nombre de notifications non lues (0 = pas de badge)
 *
 * @example
 * ```tsx
 * function App() {
 *   const { unreadCount } = useNotifications();
 *   useAppBadge(unreadCount); // Badge mis à jour automatiquement
 *
 *   return <div>...</div>;
 * }
 * ```
 */
export function useAppBadge(unreadCount: number) {
  useEffect(() => {
    if (!isBadgingSupported()) {
      logger.debug('[useAppBadge]', 'Badge API not supported on this browser');
      return;
    }

    // Mettre à jour le badge
    updateAppBadge(unreadCount);

    logger.debug('[useAppBadge]', 'Badge updated', { unreadCount });

    // Cleanup : supprimer le badge quand le composant est démonté
    return () => {
      clearAppBadge();
    };
  }, [unreadCount]);
}

/**
 * Hook pour contrôler manuellement le badge
 *
 * @returns Fonctions pour contrôler le badge
 *
 * @example
 * ```tsx
 * function App() {
 *   const { setBadge, clearBadge, supported } = useAppBadgeControl();
 *
 *   return (
 *     <div>
 *       <button onClick={() => setBadge(5)}>Set badge to 5</button>
 *       <button onClick={clearBadge}>Clear badge</button>
 *       {!supported && <p>Badge not supported</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useAppBadgeControl() {
  const supported = isBadgingSupported();

  const setBadge = (count: number) => {
    updateAppBadge(count);
  };

  const removeBadge = () => {
    clearAppBadge();
  };

  return {
    setBadge,
    clearBadge: removeBadge,
    supported,
  };
}
