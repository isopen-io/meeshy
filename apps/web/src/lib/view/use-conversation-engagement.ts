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

export type EngagementRevalidation = {
  readonly conversationId: string | undefined;
  /** Un COMPTE : `GET /conversations/:id/engagement` est réservé aux comptes
   * (403 `REGISTERED_USER_REQUIRED` pour une session invitée, #10122). */
  readonly registered: boolean;
  readonly deps?: Pick<typeof apiDeps, 'source' | 'transport'>;
};

/** Le fil ouvert relit son état serveur une fois par conversation (#8906) —
 * celui d'un compte seulement : un invité n'a pas de flamme, et la porte le
 * refuserait à chaque ouverture (#10122). */
export function useEngagementRevalidation({ conversationId, registered, deps = apiDeps }: EngagementRevalidation): void {
  const { source, transport } = deps;
  useEffect(() => {
    if (!registered || conversationId === undefined || conversationId === '') return undefined;
    if (__FIXTURES__ && source === 'fixtures') return undefined;
    const controller = new AbortController();
    void revalidateConversationEngagement({
      transport,
      store: engagementStore,
      conversationId,
      signal: controller.signal,
    }).catch(() => undefined);
    return () => controller.abort();
  }, [conversationId, registered, source, transport]);
}
