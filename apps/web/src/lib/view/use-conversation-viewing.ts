import { createContext, useContext, useEffect, useMemo, type RefObject } from 'react';
import { useStore } from 'zustand/react';

import {
  acquireConversationViewing,
  focusConversationViewing,
  herePeersOf,
  isActiveIn,
  isFocusedIn,
  isHereIn,
  signalConversationActivity,
  suspendConversationViewing,
  viewingStore,
  type ViewingState,
} from '@/lib/api/conversation-viewing';
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

/**
 * Ce que l'utilisateur FAIT dans le fil le rend actif aux yeux de ses pairs
 * (#9061) : défiler (regarder), lire un média (écouter), toucher, écrire.
 * Les GESTES seulement — `wheel`/`touchmove` plutôt que `scroll`, qu'un
 * recalage programmatique du fil déclencherait sans personne derrière. Écouté
 * en CAPTURE sur la racine du fil : `play` et `timeupdate` ne remontent pas,
 * la capture les voit quand même. Le lien borne l'émission.
 */
const ACTIVITY_EVENTS = ['wheel', 'touchmove', 'pointerdown', 'keydown', 'input', 'play', 'timeupdate'] as const;

export function useConversationActivity(conversationId: string | undefined, root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = root.current;
    if (conversationId === undefined || conversationId === '' || element === null) return undefined;
    const stir = (): void => signalConversationActivity(conversationId);
    const options = { capture: true, passive: true } as const;
    for (const event of ACTIVITY_EVENTS) element.addEventListener(event, stir, options);
    return () => {
      for (const event of ACTIVITY_EVENTS) element.removeEventListener(event, stir, options);
    };
  }, [conversationId, root]);
}

/** Une visionneuse plein écran ouverte depuis le fil le garde « dans la
 * conversation » et fait pulser son point chez les pairs (#9065). */
export function useConversationViewingFocus(): void {
  useEffect(() => focusConversationViewing(), []);
}

/** Tant que `suspended` (l'écran d'appel en grand), l'utilisateur n'est plus
 * « dans la conversation » ; le lever la rend (#9065). */
export function useConversationViewingSuspension(suspended: boolean): void {
  useEffect(() => (suspended ? suspendConversationViewing() : undefined), [suspended]);
}

/** Ce pair a-t-il CETTE conversation ouverte ? Un booléen primitif : l'en-tête
 * ne se re-rend qu'au changement de CE couple. */
export function useIsHere(conversationId: string, userId: string | undefined): boolean {
  return useStore(viewingStore, (s) => (userId === undefined ? false : isHereIn(s, conversationId, userId)));
}

/** Ce pair ICI regarde-t-il, écoute-t-il ou agit-il (#9061) ? */
export function useIsHereActive(conversationId: string, userId: string | undefined): boolean {
  return useStore(viewingStore, (s) => (userId === undefined ? false : isActiveIn(s, conversationId, userId)));
}

/** Ce pair ICI regarde-t-il un élément de la conversation en plein écran (#9065) ? */
export function useIsHereFocused(conversationId: string, userId: string | undefined): boolean {
  return useStore(viewingStore, (s) => (userId === undefined ? false : isFocusedIn(s, conversationId, userId)));
}

/** `conversationId → pairs en plein écran` pour toute la liste (#9065). */
export function useFocusedHerePeers(viewerId: string): Readonly<Record<string, readonly string[]>> {
  const focusedByConversation = useStore(viewingStore, (s) => s.focusedByConversation);
  return useMemo(() => herePeersOf({ byConversation: focusedByConversation }, viewerId), [focusedByConversation, viewerId]);
}

/** `conversationId → pairs actifs` pour toute la liste (#9061) — se lit avec
 * `peerHereIn`, comme les pairs présents. */
export function useActiveHerePeers(viewerId: string): Readonly<Record<string, readonly string[]>> {
  const activeByConversation = useStore(viewingStore, (s) => s.activeByConversation);
  return useMemo(() => herePeersOf({ byConversation: activeByConversation }, viewerId), [activeByConversation, viewerId]);
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
  const peerId = peerKeyIn(conversation, viewerId);
  return peerId !== undefined && (herePeers[conversation.id]?.includes(peerId) ?? false);
}

/** Le compte du pair d'une conversation DIRECTE ; un groupe n'en a pas. */
export function peerKeyIn(conversation: Parameters<typeof peerOf>[0], viewerId: string): string | undefined {
  const peer = peerOf(conversation, viewerId);
  return peer?.userId ?? peer?.user?.id ?? undefined;
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

/** Les pairs ICI qui regardent, écoutent ou agissent dans UNE conversation. */
export function useActiveIn(conversationId: string): readonly string[] {
  return useStore(viewingStore, (s) => herePeersIn({ byConversation: s.activeByConversation }, conversationId));
}

/** Les pairs ICI en plein écran dans UNE conversation (#9065). */
export function useFocusedIn(conversationId: string): readonly string[] {
  return useStore(viewingStore, (s) => herePeersIn({ byConversation: s.focusedByConversation }, conversationId));
}

/** Les pairs présents dans la conversation du fil que l'on lit — posé par
 * l'écran de fil, lu par chaque avatar d'auteur (bulles, frappe, en-tête).
 * Hors d'un fil : personne. */
export const HerePeersContext = createContext<readonly string[]>(NOBODY_HERE);

export function useAuthorHere(authorKey: string | undefined): boolean {
  const herePeers = useContext(HerePeersContext);
  return authorKey !== undefined && herePeers.includes(authorKey);
}

/** Les pairs actifs du fil (#9061) — posé par l'écran de fil à côté de
 * `HerePeersContext`. */
export const ActivePeersContext = createContext<readonly string[]>(NOBODY_HERE);

export function useAuthorActive(authorKey: string | undefined): boolean {
  const activePeers = useContext(ActivePeersContext);
  return authorKey !== undefined && activePeers.includes(authorKey);
}

/** Les pairs du fil en plein écran (#9065) — posé à côté de `ActivePeersContext`. */
export const FocusedPeersContext = createContext<readonly string[]>(NOBODY_HERE);

export function useAuthorFocused(authorKey: string | undefined): boolean {
  const focusedPeers = useContext(FocusedPeersContext);
  return authorKey !== undefined && focusedPeers.includes(authorKey);
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
