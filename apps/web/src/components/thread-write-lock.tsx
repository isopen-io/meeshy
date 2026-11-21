import type { ReactNode } from 'react';
import type { StoreApi } from 'zustand/vanilla';

import { apiDeps } from '@/lib/api/deps';
import type { Conversation, Message } from '@/lib/api/types';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import type { PlaintextDirectGesture } from '@/lib/view/plaintext-direct';
import { directPeerOf } from '@/lib/view/plaintext-direct-gesture';
import { readableRedirectNotices, type ReadableRedirectNoticeState } from '@/lib/view/readable-redirect';
import { threadPlaintextDirect } from '@/lib/view/thread-plaintext-direct';
import { DEFAULT_PEER_DEVICES, usePeerDeviceVerdict, type PeerDevicesPort } from '@/lib/view/use-peer-device-reach';
import { useWriteRestriction } from '@/lib/view/use-write-restriction';

import { EndToEndPeerWithoutDeviceBanner, ReadableRedirectNotice } from './end-to-end-peer-without-device-banner';
import { PlaintextDirectAction } from './plaintext-direct-action';
import { ThreadComposerChrome } from './thread-composer-chrome';
import { WriteRestrictionBand } from './write-restriction-band';

/**
 * **LE VERROU D'ÉCRITURE DU FIL** (#9928) — enveloppe le composeur : quand la
 * passerelle ferme Meeshy Global à un mineur (ou qu'un refus vient de
 * l'apprendre), le bandeau tient sa place, dans le même verre, et aucun champ
 * de saisie n'est monté. Sinon, le composeur passe tel quel.
 *
 * `messages` est le fil chargé : il dit si la conversation a été vue chiffrée
 * de bout en bout — l'avis d'activation ou un message chiffré (#12949,
 * #12986) —, ce qui la garde fermée au clair pour toujours.
 *
 * L'état final d'un TÊTE-À-TÊTE chiffré sur le web (#12986, #12966) : le
 * bandeau dit d'écrire depuis l'app, et offre d'ouvrir, à côté, la
 * conversation non chiffrée avec ce contact (`threadPlaintextDirect`, depuis
 * `viewerId` et `title` ; `plaintextDirect` le remplace). Aucun geste n'écrit
 * dans ce fil ; un groupe n'a que le bandeau.
 *
 * Un tête-à-tête chiffré dont le pair est SU sans appareil chiffré (#20075,
 * `peerDevices`) : rien n'y arrivera jamais, d'ici ni de l'app. Le composeur
 * revient, sous le bandeau « <Prénom> ne peut pas recevoir de messages
 * chiffrés » ; ce qu'on y écrit part dans le tête-à-tête lisible de la paire
 * (`useSend`, `readable-redirect.ts`), jamais dans ce fil. La conversation
 * d'arrivée dit pourquoi (`notices`). Un pair dont ce navigateur a déjà vu un
 * appareil chiffré (#20181) : le bandeau seul, sans composeur — l'envoi en
 * clair exige le geste « Écrire sans chiffrement ».
 */
export function ThreadWriteLock({
  conversationId,
  conversation,
  messages,
  viewerId = '',
  title = '',
  plaintextDirect,
  peerDevices = DEFAULT_PEER_DEVICES,
  notices = readableRedirectNotices,
  children,
}: {
  readonly conversationId: string;
  readonly conversation: Conversation | undefined;
  readonly messages?: readonly Message[] | undefined;
  readonly viewerId?: string;
  readonly title?: string;
  readonly plaintextDirect?: PlaintextDirectGesture | undefined;
  readonly peerDevices?: PeerDevicesPort;
  readonly notices?: StoreApi<ReadableRedirectNoticeState>;
  readonly children: ReactNode;
}) {
  const restriction = useWriteRestriction({ conversationId, conversation, messages });
  const offered = restriction === 'end-to-end-encrypted' && conversation?.type === 'direct';
  const peer = offered && conversation !== undefined ? directPeerOf(conversation, viewerId, title) : undefined;
  const peerVerdict = usePeerDeviceVerdict(peer?.id, peerDevices);
  const language = currentInterfaceLanguage();
  if (restriction === null) {
    return (
      <>
        <ReadableRedirectNotice conversationId={conversationId} notices={notices} language={language} />
        {children}
      </>
    );
  }
  const gesture = offered ? (plaintextDirect ?? threadPlaintextDirect({ deps: apiDeps, conversation, viewerId, title })) : undefined;
  if (peerVerdict !== 'unknown' && gesture !== undefined) {
    return (
      <>
        <EndToEndPeerWithoutDeviceBanner gesture={gesture} language={language} />
        {peerVerdict === 'automatic' ? children : null}
      </>
    );
  }
  return (
    <ThreadComposerChrome>
      <WriteRestrictionBand restriction={restriction} language={language} />
      {gesture === undefined ? null : <PlaintextDirectAction gesture={gesture} language={language} marker="write-restriction" />}
    </ThreadComposerChrome>
  );
}
