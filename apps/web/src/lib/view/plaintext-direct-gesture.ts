import { createDirectConversation, type ConversationsDeps } from '@/lib/api/conversations';
import type { Conversation } from '@/lib/api/types';

import { peerOf } from './conversation';
import { openPlaintextDirect, type PlaintextDirectGesture } from './plaintext-direct';

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
  const peer = peerOf(params.conversation, params.viewerId);
  const peerId = peer?.userId ?? undefined;
  if (peer === undefined || typeof peerId !== 'string' || peerId === '') return undefined;
  return {
    peerName: [peer.displayName, peer.user?.displayName, peer.user?.username].find((name) => typeof name === 'string' && name.trim() !== '') ?? params.fallbackName,
    open: () =>
      openPlaintextDirect(
        { online: params.online, open: (id) => createDirectConversation(params.deps, id, { plaintext: true }), go: params.go },
        { peerId, fromConversationId: params.conversation.id },
      ),
  };
}
