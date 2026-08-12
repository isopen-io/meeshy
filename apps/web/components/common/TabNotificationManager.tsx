'use client';

import { useTabNotification } from '@/hooks/use-tab-notification';
import { useGlobalConversationUnreadSync } from '@/hooks/use-global-conversation-unread-sync';

/**
 * Composant invisible monté au layout racine :
 * - badge de notification sur l'onglet navigateur (favicon + titre quand
 *   l'onglet est caché) ;
 * - application GLOBALE de `conversation:unread-updated` au cache React Query
 *   (les badges de conversations vivent sur toutes les pages, pas seulement
 *   /conversations).
 */
export function TabNotificationManager() {
  useTabNotification();
  useGlobalConversationUnreadSync();
  return null;
}
