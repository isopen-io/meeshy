'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import { setConversationUnreadInCache } from '@/lib/conversations/unread-cache';

/**
 * Applique `conversation:unread-updated` au cache React Query PARTOUT, pas
 * seulement sur /conversations.
 *
 * Le socket principal est connecté globalement et reçoit l'événement sur
 * toutes les pages, mais son seul consommateur historique (`useSocketCacheSync`)
 * n'est monté que par ConversationLayout : sur `/`, `/feed/*`, `/notifications`,
 * `/contacts`… l'événement était jeté et les badges de conversations
 * restaient figés jusqu'au retour sur la liste.
 *
 * Monté une fois au layout racine (TabNotificationManager). Écrire deux fois
 * la même valeur absolue quand ConversationLayout est aussi monté est
 * inoffensif (idempotent). Même garde de conversation active que
 * `useSocketCacheSync.handleUnreadUpdated`.
 */
export function useGlobalConversationUnreadSync(): void {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubscribe = meeshySocketIOService.onUnreadUpdated(
      (data: { conversationId: string; unreadCount: number }) => {
        const activeConversationId = useNotificationStore.getState().activeConversationId;
        const effectiveUnread =
          data.conversationId === activeConversationId ? 0 : data.unreadCount;
        setConversationUnreadInCache(queryClient, data.conversationId, effectiveUnread);
      }
    );

    return unsubscribe;
  }, [isAuthenticated, queryClient]);
}
