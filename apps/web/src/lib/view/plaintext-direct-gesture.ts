import { createDirectConversation, type ConversationsDeps } from '@/lib/api/conversations';
import type { Conversation } from '@/lib/api/types';

import { peerOf } from './conversation';
import { openPlaintextDirect, type PlaintextDirectGesture } from './plaintext-direct';

/** Le pair inscrit d'un tête-à-tête et le nom qui l'adresse — `undefined` hors direct ou sans compte (#20075). */
export type DirectPeer = { readonly id: string; readonly name: string };

export function directPeerOf(conversation: Conversation, viewerId: string, fallbackName = ''): DirectPeer | undefined {
  const peer = peerOf(conversation, viewerId);
  const id = peer?.userId ?? undefined;
  if (peer === undefined || typeof id !== 'string' || id === '') return undefined;
  const name = [peer.displayName, peer.user?.displayName, peer.user?.username].find((candidate) => typeof candidate === 'string' && candidate.trim() !== '');
  return { id, name: name ?? fallbackName };
}

/**
 * **LE GESTE « OUVRIR UNE CONVERSATION NON CHIFFRÉE AVEC <NOM> », CÂBLÉ**
 * (#12966) — pour la fiche Chiffrement d'un tête-à-tête : le pair est l'autre
 * participant inscrit ; sans lui (invité sans compte, pair parti), aucun geste.
 * La passerelle rend le tête-à-tête lisible existant ou le crée
 * (`createDirectConversation(…, { plaintext: true })`).
 */
export function plaintextDirectGesture(params: {
  readonly deps: ConversationsDeps;
  readonly conversation: Conversation;
  readonly viewerId: string;
  /** Le nom que la fiche affiche, quand le participant n'en sert aucun. */
  readonly fallbackName: string;
  readonly online: () => boolean;
  readonly go: (conversationId: string) => void;
}): PlaintextDirectGesture | undefined {
  const peer = directPeerOf(params.conversation, params.viewerId, params.fallbackName);
  if (peer === undefined) return undefined;
  return {
    peerName: peer.name,
    open: () =>
      openPlaintextDirect(
        { online: params.online, open: (id) => createDirectConversation(params.deps, id, { plaintext: true }), go: params.go },
        { peerId: peer.id, fromConversationId: params.conversation.id },
      ),
  };
}
