import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand/react';

import { acquireConversationViewing, herePeersOf, isHereIn, viewingStore } from '@/lib/api/conversation-viewing';
import { peerOf } from '@/lib/view/conversation';

/**
 * « EST DANS LA CONVERSATION » (#8892) — l'écran de fil TIENT sa
 * conversation tant qu'il est monté ; le lien (`api/conversation-viewing.ts`)
 * l'annonce quand l'onglet est au premier plan.
 */
export function useConversationViewing(conversationId: string | undefined): void {
  useEffect(
    () => (conversationId === undefined || conversationId === '' ? undefined : acquireConversationViewing(conversationId)),
    [conversationId],
  );
}

/** Ce pair a-t-il CETTE conversation ouverte ? Un booléen primitif : l'en-tête
 * ne se re-rend qu'au changement de CE couple. */
export function useIsHere(conversationId: string, userId: string | undefined): boolean {
  return useStore(viewingStore, (s) => (userId === undefined ? false : isHereIn(s, conversationId, userId)));
}

/** `conversationId → pairs présents` pour toute la liste — l'écran s'abonne
 * une fois et distribue un booléen par rangée (motif `useTypistNames`). */
export function useHerePeers(viewerId: string): Readonly<Record<string, readonly string[]>> {
  const byConversation = useStore(viewingStore, (s) => s.byConversation);
  return useMemo(() => herePeersOf({ byConversation }, viewerId), [byConversation, viewerId]);
}

/** Le pair d'une conversation DIRECTE a-t-il cette conversation ouverte ?
 * Un groupe n'a pas de pair : `false`. */
export function peerHereIn(
  herePeers: Readonly<Record<string, readonly string[]>>,
  conversation: Parameters<typeof peerOf>[0],
  viewerId: string,
): boolean {
  const peer = peerOf(conversation, viewerId);
  const peerId = peer?.userId ?? peer?.user?.id;
  return peerId !== undefined && peerId !== null && (herePeers[conversation.id]?.includes(peerId) ?? false);
}
