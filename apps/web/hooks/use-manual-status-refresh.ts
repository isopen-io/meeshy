/**
 * Hook de rafraîchissement manuel du statut (fallback si WebSocket down)
 * À utiliser UNIQUEMENT sur action utilisateur (pull-to-refresh, bouton)
 */

'use client';

import { useState, useCallback } from 'react';
import { conversationsService } from '@/services/conversations.service';
import { useUserStore } from '@/stores/user-store';

/**
 * Hook de rafraîchissement manuel du statut (fallback si WebSocket down)
 *
 * Ce hook fournit une fonction pour forcer le rafraîchissement des participants
 * d'une conversation via l'API REST. À utiliser UNIQUEMENT comme fallback si
 * WebSocket est down, ou sur action utilisateur explicite (pull-to-refresh).
 *
 * Usage:
 * ```tsx
 * function MyComponent({ conversationId }: { conversationId: string }) {
 *   const { refresh, isRefreshing } = useManualStatusRefresh(conversationId);
 *
 *   return (
 *     <button onClick={refresh} disabled={isRefreshing}>
 *       Rafraîchir
 *     </button>
 *   );
 * }
 * ```
 */
export function useManualStatusRefresh(conversationId: string | null) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const setParticipants = useUserStore(state => state.setParticipants);

  const refresh = useCallback(async () => {
    if (!conversationId || isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    try {
      const participants = await conversationsService.getParticipants(conversationId);
      setParticipants(participants);
    } catch (error) {
      console.error('[ManualStatusRefresh] Error refreshing participants:', error);
      throw error; // Laisser l'appelant gérer l'erreur
    } finally {
      setIsRefreshing(false);
    }
  }, [conversationId, isRefreshing, setParticipants]);

  return { refresh, isRefreshing };
}
