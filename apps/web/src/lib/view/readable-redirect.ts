import type { StoreApi } from 'zustand/vanilla';

import { mayRedirectAutomatically, refreshPeerDeviceReach, type EncryptedDeviceCounter, type PeerDeviceReachState } from '@/lib/e2ee/peer-device-reach';
import type { Draft } from '@/lib/send/perform-send';

import { readableDirectDestination, type PlaintextDirectPorts } from './plaintext-direct';
import type { ReadableRedirectNoticeState } from './readable-redirect-notices';
import type { DirectPeer } from './plaintext-direct-gesture';

export { createReadableRedirectNotices, readableRedirectNotices, type ReadableRedirectNotice, type ReadableRedirectNoticeState } from './readable-redirect-notices';

/**
 * **ÉCRIRE À UN PAIR SANS APPAREIL CHIFFRÉ MÈNE À NOTRE CONVERSATION EN CLAIR**
 * (#20075, décision porteur du 2026-11-20, jumelle de `EndToEndReadableRedirect`
 * iOS #20074).
 *
 * Le web ne chiffre pas de bout en bout (#10788) : dans un tête-à-tête chiffré,
 * aucun envoi n'y part jamais (#12949, `plaintextWithheld`). La redirection ne
 * vaut QUE pour un pair SU sans appareil chiffré, et à qui ce navigateur n'en a
 * jamais connu (`peerDeviceReach`, #20181) : là, rien ne peut atteindre ce
 * tête-à-tête, ni d'ici ni de l'app, et la conversation lisible de la paire est
 * le seul chemin — le bandeau l'a dit avant l'envoi. Un pair à qui un appareil a
 * déjà été connu ne redirige pas de lui-même : un serveur qui cacherait ses
 * appareils n'obtient pas le clair, le geste « Écrire sans chiffrement » le
 * demande. Un pair qui a un appareil chiffré, ou dont on ne sait rien, garde le refus
 * d'avant et le bandeau « écrivez depuis l'app » : y rediriger ferait sortir du
 * chiffrement, en silence, un message que l'app aurait chiffré.
 *
 * Ce qui part : le texte, sa langue, sa protection, ses pièces, son lieu et son
 * sticker — tous écrits dans la conversation LISIBLE, jamais téléversés vers la
 * chiffrée. Ce qui ne part pas : la citation (le message cité vit dans le fil
 * chiffré) et la réponse à une story ; l'avis d'arrivée dit la citation perdue.
 *
 * Au moment d'envoyer, l'annuaire est RELU (#20197) : un appareil listé depuis
 * l'ouverture retient le message, une lecture impossible aussi.
 */
export type ReadableRedirectPorts = Pick<PlaintextDirectPorts, 'online' | 'open' | 'go'> & {
  readonly send: (conversationId: string, draft: Draft) => void;
  /** L'annuaire relu au moment de l'envoi (#20197) : le verdict affiché peut dater. */
  readonly count: EncryptedDeviceCounter;
  readonly notices: StoreApi<ReadableRedirectNoticeState>;
};

export function redirectedDraft(draft: Draft): Draft {
  const { replyToId: _replyToId, replyTo: _replyTo, storyReplyToId: _storyReplyToId, ...carried } = draft;
  return carried;
}

/**
 * La redirection AUTOMATIQUE vaut-elle pour ce pair ? Seulement si l'annuaire
 * ne lui liste aucun appareil chiffré ET que ce navigateur ne lui en a jamais
 * connu (#20181) : un serveur qui cacherait ses appareils n'obtient pas le
 * clair, l'utilisateur doit passer par « Écrire sans chiffrement ».
 */
type Reach = Pick<PeerDeviceReachState, 'withoutDevice' | 'seenWithDevice'>;

export const redirectsToReadable = (reach: Reach, peer: DirectPeer | undefined): peer is DirectPeer =>
  peer !== undefined && mayRedirectAutomatically(reach, peer.id);

/** `withheld` : le refus d'avant ; `failed` / `offline` : la redirection n'a pas abouti, rien n'est parti. */
export type WithheldSendOutcome = 'redirected' | 'withheld' | 'failed' | 'offline';

export async function sendWithheld(params: {
  readonly fromConversationId: string;
  readonly peer: DirectPeer | undefined;
  readonly draft: Draft;
  readonly reach: StoreApi<PeerDeviceReachState>;
  readonly ports: ReadableRedirectPorts;
}): Promise<WithheldSendOutcome> {
  const { peer, ports, reach } = params;
  if (!redirectsToReadable(reach.getState(), peer)) return 'withheld';
  if (!ports.online()) return 'offline';
  const devices = await refreshPeerDeviceReach(reach, ports.count, peer.id);
  if (devices === null) return 'failed';
  if (!redirectsToReadable(reach.getState(), peer)) return 'withheld';
  const destination = await readableDirectDestination(ports, { peerId: peer.id, fromConversationId: params.fromConversationId });
  if (destination.kind !== 'ready') return destination.kind;
  ports.send(destination.conversationId, redirectedDraft(params.draft));
  ports.notices.getState().post({ conversationId: destination.conversationId, peerName: peer.name, quoteDropped: params.draft.replyToId !== undefined });
  ports.go(destination.conversationId);
  return 'redirected';
}
