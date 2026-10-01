import { createContext, useContext, useEffect, useMemo } from 'react';
import { useStore } from 'zustand/react';

import { acquireConversationViewing, coverConversationViewing, herePeersOf, isHereIn, viewingStore, type ViewingState } from '@/lib/api/conversation-viewing';
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

/** Une vue plein écran (visionneuse) couvre le fil tant qu'elle est montée :
 * l'utilisateur n'est plus « dans la conversation » (#9052). */
export function useConversationViewingCover(): void {
  useEffect(() => coverConversationViewing(), []);
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

const NOBODY_HERE: readonly string[] = [];

/** Les pairs présents dans UNE conversation — la même liste vide quand il n'y
 * en a aucun, pour que l'abonné ne se re-rende pas à chaque autre changement. */
export function herePeersIn(state: Pick<ViewingState, 'byConversation'>, conversationId: string): readonly string[] {
  return state.byConversation[conversationId] ?? NOBODY_HERE;
}

export function useHereIn(conversationId: string): readonly string[] {
  return useStore(viewingStore, (s) => herePeersIn(s, conversationId));
}

/** Les pairs présents dans la conversation du fil que l'on lit — posé par
 * l'écran de fil, lu par chaque avatar d'auteur (bulles, frappe, en-tête).
 * Hors d'un fil : personne. */
export const HerePeersContext = createContext<readonly string[]>(NOBODY_HERE);

export function useAuthorHere(authorKey: string | undefined): boolean {
  const herePeers = useContext(HerePeersContext);
  return authorKey !== undefined && herePeers.includes(authorKey);
}

type HereKeyBearer = {
  readonly id?: string | null | undefined;
  readonly userId?: string | null | undefined;
  readonly user?: { readonly id?: string | null | undefined } | null | undefined;
};

/** La clé sous laquelle la passerelle annonce une personne : son compte, ou,
 * pour un invité sans compte, sa ligne de participant. */
export function hereKeyOf(bearer: HereKeyBearer | null | undefined): string | undefined {
  return bearer?.userId ?? bearer?.user?.id ?? bearer?.id ?? undefined;
}
