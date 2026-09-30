import { useStore } from 'zustand/react';

import type { ConversationEngagementSnapshot } from '@meeshy/shared/types/engagement-scale';

import { effectiveEngagementOf, engagementStore, type EngagementState } from '@/lib/api/conversation-engagement';

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
