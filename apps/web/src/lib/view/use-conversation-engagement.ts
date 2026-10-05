import { useEffect } from 'react';
import { useStore } from 'zustand/react';

import type { ConversationEngagementSnapshot } from '@meeshy/shared/types/engagement-scale';

import { apiDeps } from '@/lib/api/deps';
import {
  effectiveEngagementOf,
  engagementStore,
  revalidateConversationEngagement,
  type EngagementState,
} from '@/lib/api/conversation-engagement';

/**
 * L'ÉTAT D'ENGAGEMENT d'UNE conversation pour l'en-tête du fil (#8906) : le
 * servi et le reçu en direct, le plus récent des deux. L'instantané rendu est
 * l'objet du magasin ou de la charge — une référence STABLE tant qu'aucun
 * geste n'est crédité.
 */
export function useConversationEngagement(conversation: { readonly id: string }): ConversationEngagementSnapshot | undefined {
  const live = useStore(engagementStore, (s) => s.byConversation[conversation.id]);
  return effectiveEngagementOf({ byConversation: live === undefined ? {} : { [conversation.id]: live } }, conversation);
}

/** Les instantanés reçus en direct pour toute la liste — l'écran s'abonne une
 * fois et distribue un instantané par rangée (motif `useHerePeers`). */
export function useLiveEngagements(): EngagementState['byConversation'] {
  return useStore(engagementStore, (s) => s.byConversation);
}

/** Le fil ouvert relit son état serveur une fois par conversation (#8906). */
export function useEngagementRevalidation(conversationId: string | undefined): void {
  useEffect(() => {
    if (conversationId === undefined || conversationId === '') return undefined;
    if (__FIXTURES__ && apiDeps.source === 'fixtures') return undefined;
    const controller = new AbortController();
    void revalidateConversationEngagement({
      transport: apiDeps.transport,
      store: engagementStore,
      conversationId,
      signal: controller.signal,
    }).catch(() => undefined);
    return () => controller.abort();
  }, [conversationId]);
}
